---
phase: 67-hosting-hardening
plan: 01
subsystem: chrome Orca supervisor and boundary (powerbrowser/shell), checks, privacy page
status: complete
tags: [orca, RUN-06, RUN-09, failure-classes, shell-kinds, credential-store, lane-p67-01]
requires: [Phase 64 merged, Phase 65 merged, Phase 66 merged (base 85c7895d)]
provides:
  - "OrcaEnv: ORCA_FAILURE_CLASSES (8), ORCA_STEP_CLASSES, ORCA_CODE_CLASSES, ORCA_OFFER_UNAVAILABLE_REASONS, ORCA_CLIENT_REASONS, ORCA_BROWSER_HOST_REASON, failureClassOf, orcaStatusReply, isClientReason, readyLineOfferUnavailableReason"
  - "OrcaEnv RUN-09: ORCA_PLAINTEXT_OVERRIDE, ORCA_TEMP_ENV_NAMES, ORCA_FIXED_TEMP_ROOTS, tempRootOf, credentialKeyFolderFor, ORCA_PROTECTION_SENTENCE"
  - "OrcaService: getState().failureClass and orcaVersion, reportClientFailure, restart(), _preflight (temp folder and plaintext override refused before any reap or spawn), rows Orca restart count / pairing failure / browser host / entry file / temporary folder / setting / credential key folder"
  - "PowerBrowserAPI: orcaStatus, orcaRestart, orcaShowDiagnostics behind groupSenderIsTheia (handleOrcaShellMessage), PowerBrowserOrcaHosting { tempDir, realPath }"
  - "powerbrowser.js: window.powerbrowserOpenDiagnostics (open-only)"
  - "privacy.html: the data-orca-credential-protection paragraph"
  - "checks: orca-failure-classes (+self-test), orca-credential-store (+self-test), orca-credential-store-live (full, +self-test), orca-service scenarios G, K, L"
affects: [lane p67-03 (frontend half of the interfaces block), coordinator 67-06 (merge, live proofs)]
tech-stack:
  added: []
  patterns: ["failure class derived from the failure rows, not a second stored field", "pinned TypeScript unions and object-literal backends read with theia/node_modules/typescript"]
key-files:
  created:
    - scripts/verify-orca-failure-classes.mjs
    - scripts/verify-orca-credential-store.mjs
    - scripts/verify-orca-credential-store-live.mjs
  modified:
    - powerbrowser/shell/OrcaEnv.sys.mjs
    - powerbrowser/shell/OrcaService.sys.mjs
    - powerbrowser/shell/PowerBrowserAPI.sys.mjs
    - powerbrowser/INTERNAL-APIS.md
    - powerbrowser/shell/powerbrowser.js
    - website-staging/privacy.html
    - scripts/verify-orca-service.mjs
    - scripts/verify-platform.sh
decisions:
  - "Step-to-class table: finding the built Orca files -> files-missing; the two RUN-09 steps -> temporary-profile and plaintext-setting; every other OrcaService step (15 strings incl. 'stopping' and 'an unexpected error') -> could-not-start; pinned_port_unavailable and orcad_instance_lock_held -> port-in-use; restarting comes from the supervisor flag, pairing-lost from an unavailable offer in the ready line, browser-not-attached from the held browser-host client reason"
  - "failureClass is computed in getState from the existing 'Orca failed step' and 'Orca failure code' rows, so restart() clearing the rows clears the class; no separate _failedCode field"
  - "The boundary reaches OrcaService and OrcaEnv by ChromeUtils.importESModule inside handleOrcaShellMessage (lazy; powerbrowser.js already loaded both), two catalogue rows"
  - "Temp roots: linux Gecko TmpD + TMPDIR/TMP/TEMP + /tmp, /var/tmp; darwin the same names + /tmp, /var/tmp, /private/tmp, /private/var/tmp; win32 TmpD + TEMP/TMP, compared case-insensitively with either separator; every root and both data roots taken lexically and through realPath"
  - "Details opens the diagnostics layer only when its computed display is none (powerbrowserOpenDiagnostics), so a second press never hides it"
  - "restart() acts only in failed (and not while stopping), clears the failure, and starts start()'s whole sequence (resolve, preflight, reap with the daemon, launch) without awaiting it, so the orcaRestart reply returns inside the frontend's 5 s acknowledgement window"
metrics:
  completed: 2026-11-11
actuals:
  tokens: 67000
  tasks: 3
  commits: 4
plan_head_before: 85c7895d20e076a830f53fed348acd4c87296aa7
plan_head_after: "the commit that adds this file (head of ServerDestroyer/p67-01)"
---

# Phase 67 Plan 01: Orca failure classes, shell kinds and the RUN-09 refusal (chrome) Summary

orcad failures are classified once in OrcaEnv into the eight classes of the interfaces block,
OrcaService reports the class and the rows the page omits, the frontend has orcaStatus /
orcaRestart / orcaShowDiagnostics behind the sender wall, and OrcaService refuses a temporary data
root or the plaintext override before it reaps or spawns anything; the privacy page states the
protection sentence and two derived checks tie both to the pinned Orca source.

## Setup

- `node scripts/generate.mjs` (72 files), `bash scripts/fetch-upstream.sh` (FIREFOX_153_5_1esr_RELEASE)
  then `bash scripts/apply-patches.sh` (8 patches), the audited Theia install from docs/BUILD.md
  (`yarn install --ignore-scripts --frozen-lockfile` and the drivelist rebuild), `bash scripts/fetch-orca.sh`
  (v1.4.248, no build, so `orca/out` is absent and the live row prints SKIP).
- Precondition held: branch ServerDestroyer/p67-01, `theia/extensions/orca-panes` and `orca-browser`
  present, p66-* merges in the history, `theia/node_modules` installed.
- **Scenario letters: G -> G, H -> K, J -> L.** The base already used A-F, H (Phase 63, no bridge
  folder), I (Phase 68, SDK extension disabled), J and J-b (Phase 64 C5, hand-off files; the plan calls
  this 64-03's scenario I). G was free; the restart scenario is K, the RUN-09 refusal scenario is L.
- **C5 confirmed, not BLOCKER:** the merged `OrcaService._stopTree` removes the offer file first,
  `powerbrowser/shell/OrcaService.sys.mjs:625`
  (`for (const name of this._bridgeDir ? [OrcaEnv.ORCAD_DATA_ROOT_FILE, OrcaEnv.ORCA_WEB_PAIRING_FILE, OrcaEnv.ORCA_PANES_DIR_FILE] : [])`
  then `removeStateFile`), and orca-service scenario J with its "not removed" plant is green on this
  lane's OrcaService. This lane adds no second removal and does not touch writePrivateFile.
- Phase 68 wave-1 edits on the base (68-07's SDK name and `_spawnAndGate` lines, scenario I, 68-10's
  rows) are kept exactly as merged; this lane's code sits beside them.

## Tasks and commits

| Task | Commit | What |
|---|---|---|
| 1 | 113a5355 | OrcaEnv classification, OrcaService failureClass/orcaVersion/reportClientFailure/rows, orcaStatus kind, catalogue shift and two rows, orca-service scenario G + 2 plants |
| 2 | a2823137 | restart(), orcaRestart and orcaShowDiagnostics, powerbrowserOpenDiagnostics, orca-failure-classes (+11-plant self-test), quick registry block; also the RUN-09 chrome code (see Deviation 1): OrcaEnv RUN-09 constants, PowerBrowserOrcaHosting, `_preflight`, scenario K (restart) and L (refusal) + 3 plants |
| fix | 0e6b265a | Orca kinds dispatched as one `case` line inside the switch (shell-request-kinds); `getTempDir` renamed `tempDir` (ng-027-reader-callers); four Phase 67 rows renumbered |
| 3 | (this commit) | privacy.html paragraph, orca-credential-store (+10-plant self-test), orca-credential-store-live (full, 11-case verdict self-test), registry rows, this SUMMARY |

## Check results (lane tree)

Green: orca-service (scenarios A-F, G, H, I, J, J-b, K, L) and orca-service-self-test (40 plants),
orca-failure-classes (17 steps, 2 codes, 8 classes; one SKIP line for lane p67-03's copy and policy
files) and its self-test (11 plants), orca-credential-store (3 pinned roots, backends host-file,
8 tempRootOf cases; one SKIP line for the copy-table sentence) and its self-test (10 plants),
orca-credential-store-live-self-test (11 cases), orca-credential-store-live (prints its SKIP, exit 0:
no objdir), internals-boundary, internals-catalogue, ng-040-internals-catalogue-lines,
ng-027-reader-callers, shell-error-contract and its self-test, shell-error-copy-no-internals,
start-path-recovery, group-channel, orca-bridge-dir, privacy-hosts, theia-endpoints,
generated-byte-identity. `node scripts/verify-orca-failure-classes.mjs --nope` exits 2.

`scripts/verify-platform.sh --quick` on the lane tree, rows red:

- **shell-request-kinds (cross-lane, expected until p67-03 merges):** "handleShellMessage accepts
  'orcaStatus' / 'orcaRestart' / 'orcaShowDiagnostics' but no Theia client dispatches it". Lane p67-03's
  orca-hosting-status.ts and orca-browser's sender dispatch them; the coordinator re-runs this row on the
  merged tree. The case/set agreement half is green.
- **scan-brand-residue and its self-test (expected for a lane):** see "Brand rows".
- Environment of this lane, not caused by it: orca-mobile-skew-self-test (no `zod` under orca/, no Orca
  install), orca-snapshot-fixtures (no agent-browser installed under orca/), tab-uris-typecheck and
  chrome-bar-typecheck (`@powerbrowser/token-gate/lib` not built), gui09-dependent-window-content and its
  self-test (no built `theia/applications/browser/lib`).

## Deviations from Plan

1. **[Rule 3 - Blocking] The RUN-09 chrome code landed in the Task 2 commit.** Task 2's
   orca-failure-classes requires every class to be reached by a cause, and Task 1 had to put the two
   refusal steps in ORCA_STEP_CLASSES while the steps only exist once `_preflight` does. Task 3 items
   (1), (2), (3) and (5) (OrcaEnv RUN-09 constants, PowerBrowserOrcaHosting with two rows, `_preflight`,
   scenario L with the "refusal after spawn" and "alias not resolved" plants) are therefore in a2823137;
   Task 3's commit carries the privacy paragraph, the two credential-store checks, their rows and this
   SUMMARY.
2. **[Rule 3] Catalogue renumbering.** `verify-ng-040-internals-catalogue-lines.mjs --fix` renumbered only
   the Touchpoints table, left the rows under "Deliberately not touched" and four mid-table rows stale and
   one row UNRESOLVED (`:7695`). The catalogue was rebuilt from the base file by adding 1 to every
   `PowerBrowserAPI.sys.mjs:N` with N at or after the inserted line, which is exact for one inserted line;
   ng-040 and internals-catalogue are green. The fix tool's gap is recorded for the coordinator.
3. **[Rule 1] Dispatch line inside the switch.** The plan's dispatch line after the wall left
   shell-request-kinds red on "SHELL_MESSAGE_KINDS admits 'orcaStatus' with no handleShellMessage case".
   The one inserted line is now `case "orcaStatus": case "orcaRestart": case "orcaShowDiagnostics": return handleOrcaShellMessage(data, actorRef);`
   as the first line of the switch: still one line, after the wall, no other switch line edited.
4. **[Rule 1] `PowerBrowserOrcaHosting.getTempDir` is named `tempDir`.** ng-027-reader-callers treats
   every `get*` method in the boundary file as a PowerBrowserAPI reader and accepts only
   `PowerBrowserAPI.<name>(` as a caller, so it reported a dead reader.
5. The files-missing site's row label changed from "Orca missing path" to "Orca entry file" (plan); the
   version-read site keeps "Orca missing path".
6. Every string value in `getDiagnosticRows` now passes `OrcaEnv.redact` (the plan's "every value through
   OrcaEnv.redact"), not only the new rows.
7. Unknown-kind default inside handleOrcaShellMessage replies the existing
   `handleShellMessage: unknown kind <kind>` validation shape (unreachable: only the three kinds dispatch).

## P67-19 facts (recorded, not changed)

- orcad's credential key folder is `~/.orca` (`orcadCredentialRoot`, homedir()/.orca), outside the data
  root, shared with any other headless orcad this user runs. It is the diagnostics row
  "Orca credential key folder" (`OrcaEnv.credentialKeyFolderFor`). Moving it needs a HOME change or a seam.
- Orca's `unavailable` key state (unreadable record, machine-ID mismatch) is not refused by PowerBrowser:
  Orca keeps the sealed credentials and refuses new ones itself.

## Owner and coordinator items

1. **browser-not-attached has no clearing message (cross-lane, needs a decision at 67-06).** Chrome holds
   `browser-host-attach-failed` until orcad's next ready line or a `restart()`; the interfaces block has no
   frontend-to-chrome message that clears it after a successful `OrcaBrowserHost.attach()`. Lane p67-03's
   effective class prefers the chrome class, so after a successful Reconnect the page would keep showing
   browser-not-attached until orcad restarts, and 67-03's induction 5 ("page gone after Reconnect") would
   go red. Options: (a) the frontend's effective class ignores a chrome browser-not-attached once its own
   attach succeeded; (b) amend the interfaces block with a clearing form of orcaStatus. pairing-lost client
   reasons do not affect chrome's class (row only), so they have no such problem.
2. 67-RESEARCH Open Question 2: orca-credential-store-live runs with the developer's own HOME, so step 2
   writes or reuses the real `~/.orca` key file; its header says so.
3. Brand inventory rows for this lane's files and identifiers (coordinator; this lane does not edit
   inventory/brand-tokens.json): see "Brand rows".
4. The live half (criterion 4 on the running product) is a coordinator proof; see below.

## Coordinator proof commands

```sh
nix develop .#firefox --command bash -c 'cd upstream && MOZCONFIG=../.mozconfig ./mach build faster'
# first launch after the chrome JS edits must purge caches (the live rows set MOZ_PURGE_CACHES=1 themselves)
flock /home/chris/coding/Power-Browser/.git/pb-live.lock scripts/verify-platform.sh --only orca-credential-store-live
flock /home/chris/coding/Power-Browser/.git/pb-live.lock scripts/verify-platform.sh --only orca-service-live
```

Both need a built `orca/out` (`nix develop .#orca --command bash scripts/build-orca.sh`). The live script
also re-execs itself under `<git common dir>/pb-live.lock` unless `PB_LIVE_LOCK_HELD=1`, and removes every
inherited `ORCA_*` name before anything starts. After p67-03 merges, re-run shell-request-kinds,
orca-failure-classes and orca-credential-store: their copy-table, offer-refusal and dispatch clauses then
compare instead of skipping.

## Merge note for the coordinator

- Registry: this lane's `# NEW (67-01, RUN-06/RUN-09, P67-02..P67-06, P67-16..P67-20)` quick block sits
  directly above `"allowlist-schema|check_allowlist_schema"` (after 66-05's block; no `# NEW (68-0N, ...)`
  block was at that anchor on the base), and the `# NEW (67-01, RUN-09, P67-16..P67-20)` full block is the
  last entry before the full-tier array's `)` (after 66-05's). Both come first among Phase 67's blocks at
  their anchors, after any `# NEW (68-0N, ...)` block merged there by then (67-06 merge rule (8)).
- Shared files with Phase 68 wave 1 (OrcaEnv, OrcaService, verify-orca-service.mjs, INTERNAL-APIS.md):
  the merged 68-07 and 68-10 lines are unchanged; this lane added functions, rows and scenarios beside them.
- INTERNAL-APIS.md: every `PowerBrowserAPI.sys.mjs:N` row with N >= 2327 is shifted by one for the inserted
  case line, and four rows were appended at the end of the Touchpoints table (two lazy imports at
  `:11728`/`:11729`, `tempDir` at `:11768`, `realPath` at `:11775`). A sibling lane that also inserts lines
  above `:11728` must re-run `node scripts/verify-ng-040-internals-catalogue-lines.mjs` after the merge and
  check the rows outside the Touchpoints table by hand (Deviation 2).
- Scenario letters: G (failure classes), K (restart, planned H), L (RUN-09 refusal, planned J).
- No WINDOWS.md ids were opened or closed.

## Brand rows

`node scripts/scan-brand-residue.mjs --report .mozbuild/p67-01/brand-report.md` with the lane files staged:
held-back rows observed against the base's expected counts:

| Row | Expected (base) | Observed (lane) |
|---|---|---|
| Orca (title/coincidental) | 2305 | 2419 |
| orca (lower/coincidental) | 4740 | 4818 |
| ORCA (upper/coincidental) | 942 | 970 |
| orcad (lower/coincidental) | 1327 | 1374 |
| ORCAD (upper/coincidental) | 192 | 200 |
| Orcad (literal/coincidental) | 102 | 104 |

Condition-4 occurrences (no inventory row claims them yet: new files not in any row's `expected_files`, and
new identifiers such as `PowerBrowserOrcaHosting`, `handleOrcaShellMessage`, `ORCA_SERVICE_MODULE`,
`ORCA_ENV_MODULE`), per file and matched form:

| File | Form | Occurrences |
|---|---|---|
| powerbrowser/INTERNAL-APIS.md | Orca | 4 |
| powerbrowser/shell/OrcaService.sys.mjs | Orca | 3 |
| powerbrowser/shell/PowerBrowserAPI.sys.mjs | Orca | 3 |
| powerbrowser/shell/PowerBrowserAPI.sys.mjs | ORCA | 4 |
| scripts/verify-orca-credential-store-live.mjs | orca | 86 |
| scripts/verify-orca-credential-store-live.mjs | Orca | 44 |
| scripts/verify-orca-credential-store-live.mjs | ORCA | 2 |
| scripts/verify-orca-credential-store.mjs | orca | 66 |
| scripts/verify-orca-credential-store.mjs | Orca | 21 |
| scripts/verify-orca-credential-store.mjs | ORCA | 39 |
| scripts/verify-orca-failure-classes.mjs | orca | 40 |
| scripts/verify-orca-failure-classes.mjs | Orca | 32 |
| scripts/verify-orca-failure-classes.mjs | ORCA | 75 |
| scripts/verify-orca-service.mjs | Orca | 4 |
| website-staging/privacy.html | orca | 1 |

424 condition-4 occurrences in all, every one in a file this lane created or changed.

## Known Stubs

None. The SKIP lines are cross-lane comparisons against lane p67-03's files, which compare once merged.

## Threat Flags

None beyond the plan's register: the three kinds sit behind the existing sender wall (T-67-01..T-67-03),
and the two new boundary methods read only (T-67-04).

## Self-Check: PASSED

- FOUND: scripts/verify-orca-failure-classes.mjs (355 lines), scripts/verify-orca-credential-store.mjs (340), scripts/verify-orca-credential-store-live.mjs (301)
- FOUND commits: 113a5355, a2823137, 0e6b265a (ancestors of HEAD); Task 3 is the commit adding this file
- Lane diff against the merge base 85c7895d lists only files_modified paths
- `grep -c data-orca-credential-protection website-staging/privacy.html` prints 1; no `pairing=` value of 20+ characters in the phase directory
