---
phase: 67-hosting-hardening
plan: 06
subsystem: coordinator (merges, builds, live proofs, brand rows, tracking)
status: blocked
tags: [orca, coordinator, RUN-06, RUN-07, RUN-08, RUN-09, INJ-01, task-2-reached]
requires: [Phases 64-66 merged (p66-* merges), hotfix-sidecar-origin merged (abca6309), lane SUMMARYs 67-01..67-05 committed]
provides:
  - "five Phase 67 lanes merged in order 01, 02, 03, 04, 05 by refs/heads"
  - "Theia, Orca (panes and browser host) and the Orca CLI built; ./mach build faster twice, mark.svg packaged"
  - "header re-record, sidecar-origin-gate-live, orca-pairing-containment-live, orca-credential-store-live, orca-service-live PASS"
  - "Orca-family brand rows re-measured; thirteen identifier rows added"
affects: [Phase 68 p68-05 (waits on Phase 67), end-of-milestone owner pass]
tech-stack:
  added: []
  patterns: ["exact INTERNAL-APIS.md line remap through each side's line diff (no ng-040 --fix)"]
key-files:
  created:
    - .planning/workstreams/orca/phases/67-hosting-hardening/67-06-SUMMARY.md
  modified:
    - powerbrowser/shell/PowerBrowserAPI.sys.mjs
    - powerbrowser/shell/OrcaService.sys.mjs
    - powerbrowser/shell/GroupActorChild.sys.mjs
    - powerbrowser/INTERNAL-APIS.md
    - theia/extensions/orca-panes/src/common/orca-panes-protocol.ts
    - theia/extensions/orca-panes/src/browser/orca-pane-bundle.ts
    - theia/extensions/orca-panes/src/node/orca-panes-backend-module.ts
    - scripts/verify-orca-service.mjs
    - scripts/verify-orca-failure-page-live.mjs
    - scripts/verify-orca-pairing-containment.mjs
    - scripts/verify-orca-landing-logo-live.mjs
    - scripts/lib/orca-offer-scan.mjs
    - inventory/brand-tokens.json
    - .planning/WINDOWS.md
    - .planning/workstreams/orca/STATE.md
decisions:
  - "p67-05 merged before Task 1's live steps, so every live proof ran once on the final tree (one faster build instead of two rounds)"
  - "The bridge-folder collector requires the offer file at exactly 0600 and every other entry private (own uid, regular, no group or other bits): Phase 63's claude-wrapper launcher is 0700 because it is executed"
  - "A speculative re-pair retry in orca-hosting-status.ts was tried and reverted: it re-pairs after Orca's client cleared its environment, which mints a new environment id"
metrics:
  started: 2026-11-11T16:55Z
  completed: 2026-11-11
actuals:
  tasks: 1
  commits: 28
plan_head_before: a2607ccbeee59e208dcc9d6332343a7f67dc844a
plan_head_after: a308e0c4  # measured before this file's own commit
---

# Phase 67 Plan 06: Coordinator Summary (stopped at Task 2)

All five lanes are merged, built and checked. Criteria 2, 3 and 4 are proven live. Criterion 5 is proven except
the remount leg. Criterion 1 is not proven: after orcad is killed, Orca's own client is refused shortly after the
automatic re-pair and clears its stored environment, and the pane bundle's `repair()` then re-pairs under a new
environment id. That id strands Orca's sessions. The root cause is in the Phase 65 overlay file
`orca-overlay/files/src/renderer/src/pb/pb-session-pairing.ts`, which Phase 67 may not change. Task 2's owner
decision was reached, so Task 3's tracking (requirements, ROADMAP, the STATE decisions) was not done.

Task 2: reached -- criterion 1 (orca-failure-page-live) cannot be proven on the merged tree; decision needed (see "Task 2").

## Lanes

| Lane | Worktree | Branch | Head merged | Merge commit |
|---|---|---|---|---|
| p67-01 | /home/chris/orca/workspaces/Power-Browser/p67-01 | ServerDestroyer/p67-01 | 31429ee1 | c84a92ee |
| p67-02 | /home/chris/orca/workspaces/Power-Browser/p67-02 | ServerDestroyer/p67-02 | 1c2f97ae | fd373d97 |
| p67-03 | /home/chris/orca/workspaces/Power-Browser/p67-03 | ServerDestroyer/p67-03 | f9969eae | d92b20ea |
| p67-04 | /home/chris/orca/workspaces/Power-Browser/p67-04 | ServerDestroyer/p67-04 | 81135549 | cb2061ae |
| p67-05 | /home/chris/orca/workspaces/Power-Browser/p67-05 | ServerDestroyer/p67-05 | dc42534c | 5c9a8b24 |

- p67-05 was created at 2026-11-11T17:24:06Z with `worktree create ... --name p67-05 --parent-worktree active
  --base-branch ServerDestroyer/v1.7-Orca-integration --json`, without an Orca agent, from cb2061ae (after the
  p67-04 merge). The coordinator session executed plan 67-05 in it: 31c8e6e2, 835eca27, dc42534c.
- Scope check (merge rule 4), derived from each plan's files_modified: every lane listed no path outside it;
  p67-03 touched 8 files under orca-panes/src (the limit). No path substitutions. No lane SUMMARY holds a BLOCKER line.

## Pre-merge baseline

`nix develop .#theia --command scripts/verify-platform.sh --quick` on a2607ccb: exit 0, 398 rows PASS, no red row.

## Merges and fix commits

| Commit | What |
|---|---|
| c84a92ee | merge p67-01. INTERNAL-APIS.md conflicted (both sides appended rows): the branch's two 66-08 rows kept, p67-01's four after them, and every `PowerBrowserAPI.sys.mjs:N` (and same-line `` `:N` ``) remapped exactly through the line diff of each side; ng-040 and internals-catalogue green without --fix |
| fd373d97 | merge p67-02 (clean) |
| d92b20ea | merge p67-03; registry blocks kept byte for byte, 67-01 then 67-03 at both anchors |
| 6849530b | fix(67-06): the 67-03 merge notes. handleOrcaShellMessage takes `{ kind: 'orcaStatus', browserHost: 'attached' }` and calls the new `OrcaService.browserHostAttached()` (clears only the browser-host reason); orca-service scenario M plus the plant "browserHostAttached() clears any client reason"; `OrcaPanesService.handOff(): Promise<OfferHandOff>` and `implements OrcaPanesService` restored; the pane bundle's wait narrows with `'pairing' in offer` |
| cb2061ae | merge p67-04; registry blocks after 67-03's |
| 5c9a8b24 | merge p67-05 (clean; its blocks last among Phase 67's) |
| b3ded25e | fix(67-06): Details answered `not-available` every time (live): `embedderElement.ownerGlobal` read from the boundary module is not the shell window. Now `ownerDocument.defaultView`, as `windowChrome` reaches it. Failing line: `const shellWindow = actorRef?.browsingContext?.top?.embedderElement?.ownerGlobal;`. Plus orca-failure-page-live harness fixes (below) |
| 214640dc | fix(67-06): containment bridge-folder rule and session-restore control; landing-logo row pairing an already-paired origin and its remount driver |
| 3a22b3b5 | fix(67-06): `if (!event \|\| event.type !== "DOMContentLoaded" \|\| this.observer)` in PowerBrowserOrcaLogoChild made group-channel derive two request names ("D0 request name -- ambiguous: PowerBrowserGroupRequest, DOMContentLoaded"); the guard is dropped (the pair registers only DOMContentLoaded). The logo row's fixture no longer joins an Orca form |
| cf6c47a3 | chore(67-06): brand rows and WINDOWS 45, 46 |
| a308e0c4 | docs(67-06): the Task 2 blocker in STATE.md Blockers/Concerns |

Phase 68 wave-1 lines (merge rule 8) were already on the branch and are unchanged: 68-07 and 68-10 lines in OrcaEnv,
OrcaService and INTERNAL-APIS.md, scenario I in verify-orca-service.mjs. Phase 67 scenario letters: G, K, L (67-01), M (67-06).

After each merge, that lane's quick rows, internals-boundary and internals-catalogue passed. After p67-03,
orca-failure-classes and orca-credential-store ran with no SKIP line, and shell-request-kinds passed.

## Builds

- Theia: `yarn install --ignore-scripts --frozen-lockfile`, the drivelist `node-gyp rebuild`, `yarn build`, inside
  `nix develop .#theia` (three times: after the merges, after a reverted experiment, after the revert).
- Orca: `nix develop .#orca --command bash scripts/build-orca.sh` ("build-orca: PASS -- built v1.4.248 ... in 31s",
  "build-orca-browser-host: PASS -- 308690 bytes"), then the Orca CLI build with `--config.verify-deps-before-run=false`.
- Gecko: `./mach build faster` after the wave-1 merges and again after the p67-05 merge (exit 0 both times).
  `objdir/dist/bin/browser/chrome/browser/content/powerbrowser/mark.svg` is the packaged mark (a symlink to
  brand/mark.svg in this dev build). Every live row set MOZ_PURGE_CACHES=1. ORCA_* was unset in every build and run.

## Header re-record

`flock .../pb-live.lock node .planning/workstreams/orca/phases/67-hosting-hardening/probes/record-sidecar-headers.mjs .mozbuild/p67-06/headers`, exit 0.
Columns: kind | method | origin | sec-fetch-site | mode | dest | user | pbCookie | theiaCookie | status.

```
host-bundle :: http | GET |  | same-origin | cors | script |  | true | true | 200  (1; /orca-panes/pb-browser-host.js)
pane-bundle :: http | GET |  | same-origin | cors | font |  | true | true | 200  (1; /orca-panes/assets/codicon-*.ttf)
pane-bundle :: http | GET |  | same-origin | cors | script |  | true | true | 200  (464; /orca-panes/pb-panes.js, /orca-panes/assets/*.js)
pane-bundle :: http | GET |  | same-origin | no-cors | style |  | true | true | 200  (1; /orca-panes/pb-panes.css)
theia :: http | GET |  |  |  |  |  | true | false | 200  (6; /powerbrowser/health)
theia :: http | GET |  | none | navigate | document |  | true | false | 200  (1; /)
theia :: http | GET |  | same-origin | cors | empty |  | true | true | 200  (3; /socket.io/)
theia :: http | GET |  | same-origin | cors | script |  | true | true | 200  (1; /editor.worker.js)
theia :: http | GET |  | same-origin | no-cors | image |  | true | true | 404  (1; /favicon.ico, no such file, past the gate)
theia :: http | GET |  | same-origin | no-cors | script |  | true | true | 200  (1; /bundle.js)
theia :: http | GET |  | same-origin | no-cors | style |  | true | true | 200  (1; /bundle.css)
theia :: http | POST | <own origin> | same-origin | cors | empty |  | true | true | 200  (2; /socket.io/)
theia :: ws | GET | <own origin> | same-origin | websocket | empty |  | true | true | 101  (1; /socket.io/)
probe=theia-{cors,img,nocors,upload,worker} :: same-origin | 200; theia-ws 101
probe=orcad-stock-{cors,img,nocors,upload,worker} :: same-site | 403; orcad-stock-ws 400
probe=orcad-overlay-{cors,img,nocors,upload,worker} :: same-site | pbCookie false | 403; orcad-overlay-ws 400
probe=agent-{cors,img,nocors,upload,worker} :: same-site | pbCookie false | theiaCookie false | 403; agent-ws 400
probe=stock-{cors,img,nocors,upload,worker,samesite-nav} :: same-site | 403; stock-ws 400
probe=overlay-{cors,img,nocors,upload,worker} :: same-site | 403; overlay-ws 400
probe=xsite-nav :: cross-site | navigate | document | 403
upload-theia.txt written: true; stock, overlay, orcad-stock, orcad-overlay, agent: false
```

Every PowerBrowser class is admitted (same-origin, none or no value; no foreign Origin; 2xx/101, favicon 404 past
the gate). Every orcad-origin row is 403 (400 for the WebSocket). No refused PowerBrowser class: no gate change.

## Live proofs (final tree)

| Row | Result |
|---|---|
| sidecar-origin-gate-live (criterion 3) | `sidecar-origin-gate-live: PASS -- the Theia frame and its Orca pane bundle are served; a same-site loopback page and orcad's own page in a stock window, and orcad's page in a web tab, get 403 for GET, img, navigation and the upload POST` (pane bundle: 467 requests, style/script/font same-origin -> 200) |
| orca-pairing-containment-live (criterion 2) | `orca-pairing-containment: PASS -- 9 sinks read, each control found, no needle of the launch's offer outside its five holders`; every sink "control found, 0 matches": bridge folder, non-loopback peer, history, session restore, setups and shell state, logs, address field, copyable text, whole profile; theia-fragment (recorded): absent from 2 address texts |
| orca-credential-store-live (criterion 4) | `orca-credential-store-live: PASS -- orcad on a temporary data root reports the pinned disposable-profile string; PowerBrowser on a normal profile reports a pinned host-key string (orcad pid ... found by the walker: true); a temporary profile and the plaintext override are refused with their class and row and no orcad process` |
| orca-service-live | `orca-service-live: PASS -- 19 environment names equal the expected set (planted ORCA_PLANT_62 absent), data root through the alias, ws://127.0.0.1:<port>, Node 24.19.0 shared with the Theia backend; quit ended a tree of 5 processes ...` |
| orca-landing-logo-live (criterion 5) | FAIL on the remount leg only. ok: proxy control (Orca's own logo on a second port, 1 element, src not the mark); orcad web tab (the PB mark, brand/mark.svg bytes, alt "PowerBrowser logo"); stock window (the mark and alt); Theia document (0 injected attributes, the same query found 1 in the orcad page). gh called 1 time (stub). Red: `remount: after Landing mounted again, no element matched the version's selectors (the PB mark was not applied)` |
| orca-failure-page-live (criterion 1) | FAIL (Task 2). Last run on the committed tree: `auth-refusal: control: orca-pane:chat1 already shows the pairing-lost page before the induction` (and term1), `offer-refusal: control: ...` (both tabs), 4 failures. Restarting (page shown on both tabs and the side panel, content back), port-in-use (with Details) and browser-not-attached (with Reconnect) pass in that run |

Induction 3 (auth refusal, A-7): achieved only in a diagnostic run with induction 1 disabled (that run printed
`orca-failure-page-live: PASS -- every hosted view showed the PowerBrowser page for each induced class and recovered`);
after induction 1 it is "not achieved at the pin ... (rows removed: 0)" because the client is already on a new
environment. The registered row has not passed.

### orca-failure-page-live: what was fixed, what remains

Harness fixes in the p67-03 lane file (Rule 1, each measured live):
1. New Orca Chat waited on a worktree quick pick that nothing answers ("timed out after 180000 ms waiting for the
   page probe"); the scratch worktree is now selected in the pane client first, as the other Orca rows do (C64-6).
2. A hosted tab that was never current has no mounted content ("a hosted chat and a hosted terminal with content"
   timed out with term1 content false); each tab is shown before its content is judged.
3. "the Orca side panel showed no view to read": the panel is opened in the Orca mode with its parts expanded.
4. After the auth-refusal pause leaves another class up, that class's Reconnect runs before the next control.

Product fix (p67-01 file): Details opened nothing (see b3ded25e). Now `port-in-use` passes with Details.

Remaining (not fixed, root cause outside the lanes' files), measured with an instrumented copy:
- After `kill -9` of orcad: chrome reports ready, the automatic re-pair runs and content returns; 6-10 s later Orca's
  client reports `verification: 'blocked'`, `blockedReason: 'access-revoked'` and logs "Pair this web client with an
  Orca server first." / "Unknown Orca runtime environment: web-<uuid>" from its subscriptions.
- Orca's `createStoredWebRuntimeEnvironment` (orca/src/renderer/src/web/web-runtime-environment.ts:131-149) keeps
  the environment id only when a same-host previous environment is stored ("a new one strands its sessions
  (#11574)"). Once Orca's client clears it on the refusal, `repair()` in the overlay's pb-session-pairing.ts makes a
  new id. Reconnect from browser-not-attached then fails at the attach step's connection
  ("the browser host did not attach at the connection step").
- A retry of the re-pair on a refusal inside 30 s of the automatic re-pair (orca-hosting-status.ts) cleared the
  page class but left Orca's subscriptions on the stranded id; it was reverted, not committed.

## Task 2

Task 2: reached, not decided. Item for the owner (blocking-human; the AskUserQuestion box was not used, per the
caller's instruction to stop and report):

- **Criterion 1 restart recovery.** Options from the plan:
  - option-a (recommended): fix at the source. Re-open the Phase 65 overlay item so `repair()` keeps the hosted
    client's environment id across an orcad restart (for example, hold the last same-host environment and pass it as
    `previousEnvironment` even after Orca's client cleared storage), then re-run orca-failure-page-live.
  - option-b: record "the page recovers by itself after orcad restarts" as not delivered (WINDOWS 45, ROADMAP
    criterion 1 text), and mark RUN-06 complete on the other inductions.
  - option-c: re-plan lane p67-03's recovery with the owner's constraint (for example, reload the Theia document
    after an orcad restart instead of calling `repair()`).
- Second item, same pass: the orca-landing-logo-live remount leg (A-9, WINDOWS 46). Removing the activated worktree
  activates the repository's main worktree, and closing its terminals did not bring Landing back within 30 s. The
  driver needs a way to reach "no active worktree" in an orcad page that also has a repository.

## Re-run of the rows whose profiles moved (P67-21)

Derived list (grep -l makeProfile or withFirefoxPage in scripts/verify-*.mjs, then the registry labels naming those
scripts): extension-actions-live, extension-amo-live, first-boot-surface-carried, first-boot-surface-fresh,
gui01-browser-close-does-not-quit, gui02-web-tab-live, gui07-mode-switch-tabs-live, ng063-packaged-launch,
ng067-frontend-errors-reach-telemetry, ng069-sidecar-egress, ng073-declared-extension-loads,
orca-agent-status-live, orca-failure-page-live, orca-landing-logo-live, orca-packaged-live,
orca-relaunch-restore-live, tel06-error-delivery-live; plus verify-branding-identity-dev and verify-endpoints, and
every Orca, extension and sidecar row of p67-04's list of 97.

Each under `flock /home/chris/coding/Power-Browser/.git/pb-live.lock` with PB_LIVE_LOCK_HELD=1 and ORCA_* unset:

| Row | Result |
|---|---|
| orca-slotless-start, orca-agent-status-live, orca-claude-sdk-built, bundled-extensions-live, orca-pane-entry, orca-pane-standalone-live, orca-pane-css-live, orca-terminal-keys-live, orca-workspace-live, orca-side-panel-live, orca-add-project-live, orca-offer-scan, orca-relaunch-restore-live, orca-browser-host-bundle, no-remote-agent-port-live, orca-browser-snapshot-live, orca-browser-agent-live, orca-agent-mark-live | PASS |
| extension-amo-live, ext-tab-host-live, ng073-declared-extension-loads, ng069-sidecar-egress, first-boot-surface-carried, first-boot-surface-fresh, gui01-browser-close-does-not-quit, gui07-mode-switch-tabs-live, ng067-frontend-errors-reach-telemetry, verify-branding-identity-dev, verify-endpoints | PASS |
| orca-tabs-live | FAIL, stage tab-groups-cross-client only: `the second client shows no tab for T`. The red recorded before Phase 66 (TAB-04, STATE Deferred Verification) |
| extension-actions-live | FAIL: `private-access` (WINDOWS 29, known open since Phase 39) and `policies-shell-only: the policy Default engine was not applied with no stock window: the default is "Google" and the policy record is null, policies.json names "DuckDuckGo Lite"`; this objdir has no `dist/bin/distribution/` (no policies.json installed), so the policy leg cannot apply here; not caused by the profile move |
| gui02-web-tab-live | FAIL: `mode-descriptors.ts: derived 4 shipped mode ids, expected exactly three (coding, browsing, organising)`; the Orca mode (Phase 65) is the fourth; not caused by Phase 67 |
| orca-packaged-tree, orca-packaged-live, ng063-packaged-launch | FAIL: no container-built release tree (`objdir-release/dist/bin/application.ini` absent); environment (WINDOWS 30 class) |
| tel06-error-delivery-live | first run FAIL: `the working tree is dirty (1 tracked change(s), first: M .planning/workstreams/orca/STATE.md)` (this plan's own tracking edit); re-run after the commit: `tel06-error-delivery-live: PASS` |

Not re-run (the rest of p67-04's 97 rows: address-bar, nav-keys, page-*, pan0*, prompts, site-identity, sql-store,
tab-strip, modes-name-cap, new-window-adopt, gui08, nimbus-exposure, search-engines-packaged, real-input-gate and
ng-001..ng-038/ng-085): status unknown on the moved profile base; they use makeProfile or a firefox-bidi default and
are covered by the same dispose path the rows above exercised.

Leftover check: `.mozbuild/pb-live-profiles/` is empty. Under `$XDG_RUNTIME_DIR` 347 `pb-orca-*` entries exist;
339 predate this run. The 8 created during it (times matched to the row logs) came from no-remote-agent-port-live
(two alias links and two bridge folders), orca-browser-agent-live (one), first-boot-surface-fresh or
gui01-browser-close-does-not-quit (two bridge folders) and one diagnostic run. Those rows do not create their profiles
through makeProfile, so p67-04's dispose does not reach them; nothing was deleted by this plan.

## Seams and egress

Not run (Task 3). No file under orca-overlay/ or orca/ was changed by any Phase 67 commit:
`git diff --name-only a2607ccb HEAD -- orca-overlay` prints nothing.

## Brand rows

Measured with the scanner's own matcher on the committed tree (`node scripts/scan-brand-residue.mjs --report
.mozbuild/p67-06/brand-report-final.md`); the scan and its self-test exit 0; no exclude entry.

| Row | Old | New | Files added |
|---|---|---|---|
| Orca (title) | 2322 | 2830 | 16: scripts/lib/firefox-bidi.mjs, scripts/lib/pb-relaunch.mjs, the eight new Phase 67 checks, verify-sidecar-origin-gate(-live).mjs, orca-failure-copy.ts, orca-failure-page.tsx, orca-hosting-status.ts, offer-file-policy.ts |
| orca (lower) | 4752 | 5327 | 18 (as above plus scripts/lib/mozlz4.mjs, verify-shell-error-copy.mjs, website-staging/privacy.html) |
| ORCA (upper) | 946 | 1220 | 15 (PowerBrowserAPI.sys.mjs, the new checks, verify-shell-error-copy.mjs, the four orca-panes files) |
| orcad (lower) | 1330 | 1639 | 14 (GroupActorChild.sys.mjs, firefox-bidi.mjs, the new checks, orca-hosting-status.ts, offer-file-policy.ts) |
| ORCAD (upper) | 192 | 222 | 4 |
| Orcad (literal) | 102 | 125 | 3 |
| withOrca (literal) | 33 | 39 | 3 (firefox-bidi.mjs, verify-orca-landing-logo-live.mjs, verify-orca-pairing-containment.mjs) |

New literal rows (60-04 rule): handleOrcaShellMessage 8, PowerBrowserOrcaHosting 7, PowerBrowserOrcaLogo 18,
registerOrcaLogoActor 3, removeOrcaPathsFor 5, readyOrca 7, loadOrcaParser 2, checkOrcaCopy 5, readOrcaSources 3,
loadOrcaCopy 2, runOrcaCopySelfTest 2, addOrca 3, mutateOrca 3.

## --quick against the baseline

`nix develop .#theia --command scripts/verify-platform.sh --quick` on cf6c47a3:
`verify-platform: PASS -- all checks passed`, 410 rows PASS (baseline 398; the 12 added rows are Phase 67's quick
rows). The first run after the merges was red on group-channel (fixed in 3a22b3b5), group-channel-self-test (the same
cause) and fixer-isolate-self-test (sandbox-only: `--only fixer-isolate-self-test` outside the sandbox printed
`fixer-isolate-self-test: PASS`).

## Deviations from Plan

1. p67-05 executed by the coordinator session in its Orca worktree (no gsd-executor subagent was available to this
   session); its lane SUMMARY records its own deviations.
2. p67-05 merged before Task 1's live steps; every live proof ran on the final tree.
3. The 67-03 merge items touched `orca-panes-protocol.ts` and `orca-pane-bundle.ts`, outside every lane's
   files_modified (caller-directed: the handOff typing and its one caller).
4. The bridge-folder rule changed from "every file 0600" to "the offer file 0600, every other entry private"; the
   self-test gained a 0700 launcher (green), a 0750 launcher (red) and a 0640 offer file (red).
5. Fix-attempt limit reached on orca-failure-page-live (restart recovery) and on the landing remount leg; both are
   WINDOWS entries and Task 2 items.

## Owner items (end-of-milestone pass)

| Item | What to decide |
|---|---|
| P67-17 | Refuse the plaintext override although orcad never receives it |
| P67-18 | The protection sentence only on the two refusal pages and the privacy page |
| P67-19 | PowerBrowser's orcad shares ~/.orca with any other headless orcad; Orca's unavailable key state is not refused |
| P67-21 | Live profiles moved out of /tmp (to .mozbuild/pb-live-profiles/) rather than a test-only bypass pref |
| CA-07 | One used runtime-token row per paired launch accumulates in orca-devices.json: accept, or chrome removes PB-minted rows before spawn |
| HOME for live rows | Live rows write the developer's real ~/.orca (orca-credential-store-live and others): set HOME to a scratch folder or not |
| P65-06 | The workspace path in the Orca tab URL |
| T-61-04 | Orca's renderer runs in the authenticated Theia document (unchanged) |
| T-66-08-04 | Accepted risk, unchanged |
| D-35 | Revisit popups from agent pages if real workflows need them (for example an OAuth sign-in) |
| External protocols | The external-protocol dialog from agent pages |
| Browser host page class | Covered by browser-not-attached (P67-36); a separate class for a host that never attached is not built |
| Copy | The eight failure messages, the protection sentence and the two RUN-09 sentences |

## Deferred Verification (59-CONTEXT D-18)

| Item | Runs in |
|---|---|
| The failure page in an Orca tab in light and dark themes, and where its buttons sit | End-of-milestone pass |
| The PB mark visible on Orca's dark landing tile | Same |
| The protection sentence and the two RUN-09 sentences as the owner wants them | Same |
| CA-07 device rows; live rows on the real ~/.orca | Same |
| The owner picks above | Same |

## Known limits

- A-12: an unreadable orca-devices.json answers registry_unavailable, which Orca's client retries and never reports.
- P67-19 facts: orcad's credential key folder is ~/.orca (shared); Orca's `unavailable` key state is not refused.

## Self-Check

PASSED for what this plan claims: merge and fix commits c84a92ee, fd373d97, d92b20ea, 6849530b, cb2061ae, 5c9a8b24,
b3ded25e, 214640dc, 3a22b3b5, cf6c47a3, a308e0c4 and lane p67-05's 31c8e6e2, 835eca27, dc42534c are ancestors of HEAD;
`git log --merges -8 --format=%s | grep -c p67-0` prints 5; scripts/verify-orca-landing-selectors.mjs,
scripts/verify-orca-landing-logo-live.mjs and 67-05-SUMMARY.md exist; no `pairing=` value of 20+ characters in the phase
directory; nothing pushed; the ledger untouched. The plan itself is not complete: Task 2 waits on the owner and Task 3's
tracking (requirements RUN-06..RUN-09 and INJ-01, ROADMAP progress and criterion 5 text, STATE decisions, FEATURES.md T-8)
was not done.
