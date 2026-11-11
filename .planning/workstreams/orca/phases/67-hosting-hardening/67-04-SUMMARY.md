---
phase: 67-hosting-hardening
plan: 04
subsystem: verification
tags: [orca, pairing, containment, run-07, run-09, mozlz4, live-profiles]
status: complete
requires:
  - "Phase 65 scripts/lib/orca-offer-scan.mjs (P65-23, CA-09)"
  - "Phase 65 scripts/verify-orca-relaunch-restore-live.mjs withOrcaProfile and livePrerequisites"
  - "OrcaEnv.aliasPathFor, bridgeDirFor, dataRootFor, nodePlatform, isLoopbackEndpoint"
provides:
  - "orca-pairing-containment-self-test (quick) and orca-pairing-containment-live (full)"
  - "scripts/lib/mozlz4.mjs (decodeMozLz4, encodeMozLz4Literal)"
  - "nine containment collectors with controls in scripts/lib/orca-offer-scan.mjs"
  - "repo-local live profile base .mozbuild/pb-live-profiles/ with alias and bridge-folder cleanup"
affects:
  - "every live row that uses makeProfile or a firefox-bidi.mjs default profile (list below)"
tech-stack:
  added: []
  patterns:
    - "collector { sink, control, read }: a collector whose control is absent is red 'collector blind'"
    - "holder-5 file set derived from Orca source templates at the pin, 'source moved' when a site stops reading"
key-files:
  created:
    - scripts/verify-orca-pairing-containment.mjs
    - scripts/lib/mozlz4.mjs
  modified:
    - scripts/lib/orca-offer-scan.mjs
    - scripts/lib/pb-relaunch.mjs
    - scripts/lib/firefox-bidi.mjs
    - scripts/verify-platform.sh
decisions:
  - "mozlz4 fixtures use a literal-only encoder; the decoder is a plain LZ4 block decoder with range checks"
  - "Live profile base is .mozbuild/pb-live-profiles/ under the repo root (ignored), shared by makeProfile and both firefox-bidi defaults"
  - "The live control marker is the random path of the served marker page, so a surface that trims the scheme still shows it"
  - "The tab-address copy of an Orca tab is read from TabUriRegistry.uriOf(widget); no Orca-tab copy-address command exists in the tree"
  - "PowerBrowser stdout and stderr are captured through PB_LIVE_STDOUT_PATH / PB_LIVE_STDERR_PATH defaults in withFirefoxPage, because Phase 65's withOrcaProfile passes no options to withShell"
metrics:
  duration: "about 75 min"
  completed: 2026-11-11
actuals:
  tokens: 15346
  tasks: 3
  commits: 3
plan_head_before: 85c7895d20e076a830f53fed348acd4c87296aa7
plan_head_after: c421ee3cb4ec48210914eb7204172c94b5144e72
---

# Phase 67 Plan 04: Pairing-offer containment scanner and repo-local live profiles Summary

The containment check scans nine PowerBrowser sinks for the orcad pairing offer, using Phase 65's one scanner. Each sink has a collector that must find its own harmless control before an absence counts. The self-test plants the offer in 15 places, and each plant goes red naming its sink. Live profiles move from /tmp to `.mozbuild/pb-live-profiles/`, and dispose now removes the data-root alias and the bridge folder.

## Setup

- `nix develop .#theia --command node scripts/generate.mjs`: PASS, 72 files.
- `bash scripts/fetch-orca.sh`: orca/ cloned at v1.4.248 (965978bc78bf03a6a43187c1ed28fcffe0e01bb5). Shallow clone, no build.
- Theia install `yarn install --ignore-scripts --frozen-lockfile`: exit 0. `theia/node_modules/typescript` is present.
- `scripts/lib/orca-offer-scan.mjs` is present on the base, from the Phase 65 merge, so no BLOCKER.

### orca-offer-scan.mjs exports

- **Before (Phase 65):** RUNTIME_ENV_KEY, SINKS, pairingInputOf, needlesFromOffer, collectSinks, readOriginKeys, scanProfile, formatScan.
- **After:** all of the above with unchanged behaviour, plus countMatches, runCollector, collectorLine, readHistory, historyCollector, registryFilesFromPin, offerEndpoint, isLoopbackProcAddress, listenSockets, readSessionFiles, sessionRestoreCollector, setupsCollector, logsCollector, addressFieldCollector, copyableTextCollector, wholeProfileCollector, bridgeFolderCollector, nonLoopbackPeerCollector, COLLECTORS.
- Phase 65's needle builder was already a superset of P67-10's set. It covers the raw code, the URL-encoded code, the orca://pair? form, the #pairing= fragment and the decoded deviceToken, plus the web-client URL, the URL-encoded pairing URL and the percent, base64 and base64url token forms. It is unchanged. `node scripts/verify-orca-offer-scan.mjs --self-test` passes after every task (19 planted faults).

### Holder 5 derived at the pin (v1.4.248, A-8)

- `orca-devices.json`: DEVICE_REGISTRY_FILENAME in src/main/runtime/mobile-pairing-files.ts.
- `orca-e2ee-keypair.json`: E2EE_KEYPAIR_FILENAME in src/shared/runtime-e2ee-keypair-file.ts. MOBILE_PAIRING_USERDATA_FILES lists both. This file is excluded as pairing material and is not expected to hold a needle. That is recorded, not asserted.
- Durable-write temporaries `orca-devices.json.<pid>.<ms>.<hex>[.owner-<x>].tmp`: the durableWriteTempPath template in src/main/filesystem/durable-file-write.ts, converted into a pattern.
- Quarantine copies `orca-devices.json.corrupt-<ms>`: corruptCopyPrefix in src/main/runtime/device-registry-corruption.ts.
- If any of these sites stops matching, the check is red "source moved". The self-test checks the real orca/ when it is present: orca-devices.json and `.corrupt-1` are holders, orca-data.json is not.

## Collectors and their controls (P67-10, P67-11)

| Sink | Reads | Control |
|------|-------|---------|
| history | moz_places url and title through node:sqlite read-only on a copy, plus the raw places.sqlite-wal bytes | the marker in a moz_places url |
| session restore | sessionstore.jsonlz4 and every sessionstore-backups/* file, decoded by mozlz4.mjs | the marker in the decoded text |
| setups and shell state | Phase 65's byte sinks setups.json and powerbrowser-shell-state.json | both read, and the saved Setup's name in setups.json |
| logs | captured PB stdout and stderr (the Theia console is mirrored through devtools.console.stdout.content), OrcaService and TheiaService log lines, every regular file under orcad's data root except holder 5 | OrcaService's `orcad ready on ` line |
| address field | the chrome-bar pill text for every Orca tab and the control web tab | the marker in the control web tab's text |
| copyable text | diagnostics rows and log joined as Copy diagnostics joins them, plus each Orca tab's address copy | a row `Orca port: <n>` |
| whole profile | every regular file in the profile except the Theia origin's storage folder (holder 4) and holder 5 | the marker bytes in places.sqlite or its WAL |
| bridge folder | folder 0700 and files 0600, all owned by this user; a needle in any file other than web-pairing is a stray | the offer found in web-pairing by the same byte scanner, which also proves the needle encodings |
| non-loopback peer | the decoded endpoint passes isLoopbackEndpoint against the Orca port; every LISTEN row of orcad and the Theia backend in /proc/net/tcp{,6} is on loopback | at least one orcad LISTEN row |

Recorded clause (65-RESEARCH Q2): the live run prints whether the Theia document's fragment appears in any address text it read. The clause is recorded and never turns the row red.

## Self-test results (each positive control proven)

`node scripts/verify-orca-pairing-containment.mjs --self-test` passes with 40 `ok` lines: "40 cases, 15 planted faults each red naming its sink, 9 controls found and 9 blind collectors red". `--nope` exits 2 with usage and a Next step line.

- **Positive controls:** on a clean fixture, all nine collectors find their control and report 0 matches. The clean fixture puts the offer in every holder: orca-devices.json, a durable-write `.tmp` sibling, and a stand-in file in the Theia origin's storage. A green result therefore also proves the holder exclusions.
- **Plants that go red by sink:**
  - history: a moz_places row, and a WAL page
  - session restore: a compressed session file
  - setups and shell state: a Setups record
  - logs: a log text, and orca-data.json in the data root
  - address field: an address text
  - copyable text: a diagnostics row, and a tab-address copy
  - whole profile: prefs.js
  - bridge folder: a 0644 offer file in a 0755 folder ("bridge folder mode"), and web-pairing.bak ("stray copy")
  - non-loopback peer: the endpoint ws://192.168.1.5:26768, and a Theia LISTEN socket on 0.0.0.0
  - a renamed registry constant: "source moved"
- **Allowed:** a needle in orca-devices.json.corrupt-1 stays green for both logs and whole profile.
- **Blind collectors:** one case per collector removes its control, and all nine go red "collector blind".
- **mozlz4:** a 300-byte round trip, a hand-built block with an overlapping match (offset 3, length 9), and a refused bad magic.
- **Output:** contains no needle. It goes through installOutputRedaction, and an explicit leak check confirms it.
- **Registry:** `scripts/verify-platform.sh --only orca-pairing-containment-self-test` PASS. `--only orca-pairing-containment-live` PASS, which here means the row prints its SKIP: "no built PowerBrowser (objdir/dist/bin/powerbrowser missing)".

## Profile move (P67-21 as amended by A-6)

- `makeProfile` creates its profile and its config home with mkdtemp under `<repo>/.mozbuild/pb-live-profiles/`. Both `firefox-bidi.mjs` defaults (`captureScreenshot` and `withFirefoxPage` without profileDir) use the same base through `liveProfileDir`.
- `dispose`, and the firefox-bidi cleanups for profiles they created, also call `removeOrcaPathsFor(profileDir)`. It removes the paths `aliasPathFor` and `bridgeDirFor` derive over `dataRootFor`, ignores absent paths, and logs a removal error instead of throwing. Kept profiles (a caller-supplied profileDir) are untouched.
- Proven here:
  - The plan's makeProfile assertion exits 0: not under a temp root, inside the base, gone after dispose.
  - A planted alias symlink and bridge folder at the derived paths were removed by dispose, and the link's target folder survived.
  - The base was empty after every run in this lane.

### Rows re-run after the move (quick rows importing either library, directly or through a harness library), each with `--only`

22 PASS:

- bidi-remote-value, bidi-remote-value-self-test
- extension-actions-live-static, extension-amo-live-static
- first-boot-surface-self-test, mar-hop-driver-self-test
- orca-add-project-live-self-test, orca-agent-status-live-self-test, orca-browser-snapshot-live-self-test, orca-packaged-live-self-test, orca-pairing-containment-self-test
- orca-pane-css-live-self-test, orca-pane-entry-self-test, orca-pane-standalone-live-self-test
- orca-relaunch-restore-live-self-test, orca-service-live-self-test, orca-side-panel-live-self-test, orca-slotless-start-self-test
- orca-tabs-live-self-test, orca-terminal-keys-live-self-test, orca-workspace-live-self-test
- tel06-error-delivery-live-self-test

2 red, both caused by the lane environment and not by the move:

- nimbus-exposure-self-test: upstream/ is not checked out in the lane.
- orca-snapshot-fixtures: orca/ was fetched without node_modules, so agent-browser is reported as null.

A full `--quick` run in the lane is red in 63 rows. All of them trace to three causes, and none to this lane's code:

- upstream/ is absent.
- orca/node_modules is absent (orca-mobile-skew-self-test cannot find zod).
- The brand-residue inventory rows the coordinator owns (see the merge note). scan-brand-residue-self-test fails because its extra-root control re-runs the main scan.

### Live rows whose profiles moved (the coordinator re-runs these)

This list comes from a grep of the full tier. A row is included when its script calls makeProfile, runCheck, withOrcaProfile, withProbeShell or withOrcaTabsSession, imports a harness library built on pb-relaunch, or calls withFirefoxPage or captureScreenshot. A row that passes its own profileDir to withFirefoxPage keeps that profile. It contains 97 rows:

- **address bar and extensions:** address-bar-live, address-bar-live-self-test, extension-actions-live, extension-actions-live-self-test, extension-amo-live, extension-amo-live-self-test, ext-tab-host-live, ext-tab-host-live-self-test
- **first boot and GUI:** first-boot-surface-carried, first-boot-surface-fresh, gui01-browser-close-does-not-quit, gui02-web-tab-live, gui02-web-tab-live-self-test, gui07-mode-switch-tabs-live, gui07-mode-switch-tabs-live-self-test, gui08-loose-cards-live
- **modes, navigation, windows:** modes-name-cap-at-input-live, nav-keys-live, nav-keys-live-self-test, new-window-adopt-live, new-window-adopt-live-self-test
- **ng-001 to ng-038 and ng-085:** ng-001 through ng-015, ng-017, ng-018, ng-021 through ng-026, ng-028 through ng-038, ng-085
- **packaged launch and telemetry:** ng063-packaged-launch, ng067-frontend-errors-reach-telemetry, ng069-sidecar-egress, ng073-declared-extension-loads, nimbus-exposure
- **Orca:** orca-add-project-live, orca-agent-mark-live, orca-agent-status-live, orca-browser-agent-live, orca-browser-snapshot-live, orca-offer-scan, orca-packaged-live, orca-pairing-containment-live, orca-pane-css-live, orca-pane-entry, orca-pane-standalone-live, orca-relaunch-restore-live, orca-side-panel-live, orca-slotless-start, orca-tabs-live, orca-terminal-keys-live, orca-workspace-live
- **page, panorama, prompts:** page-furniture-live, page-furniture-live-self-test, page-tools-live, page-tools-live-self-test, pan03-strip-group-live, pan04-undo-close-group-live, pan05-card-close-live, prompts-live, prompts-live-self-test
- **remaining rows:** real-input-gate-self-test, search-engines-packaged, sidecar-origin-gate-live, site-identity-live, site-identity-live-self-test, sql-store-roundtrip, sql-store-roundtrip-self-test, tab-strip-live, tab-strip-live-self-test, tel06-error-delivery-live

None of these rows ran in the lane, because there is no built PowerBrowser here.

## Coordinator proof commands

Run on the merged, built tree, after lanes p67-01 and p67-03 are merged, with every ORCA_* unset:

1. `flock /home/chris/coding/Power-Browser/.git/pb-live.lock scripts/verify-platform.sh --only orca-pairing-containment-live`
2. The P67-21 correction: re-run every live row that uses makeProfile or a firefox-bidi default, above all the Orca rows (orca-offer-scan, orca-relaunch-restore-live, orca-service-live's dependants, orca-tabs-live, orca-workspace-live, orca-browser-*, orca-agent-*). Each runs under the same flock. Afterwards, confirm that `.mozbuild/pb-live-profiles/` is empty and that no `pb-orca-<hex>` link or `-bridge` folder from the run is left under `$XDG_RUNTIME_DIR`.
3. `scripts/verify-platform.sh --only orca-pairing-containment-self-test` and `--only orca-offer-scan-self-test`.

## Merge note for the coordinator

- **Registry blocks:** `scripts/verify-platform.sh` has two `# NEW (67-04` blocks. The quick block sits above `"allowlist-schema|check_allowlist_schema"`. The full block sits before the close of the full-tier array, after orca-agent-mark-live. When merging, place both after p67-03's blocks at the same anchors.
- **Brand rows:** the brand scan was run with the lane files staged (report at `.mozbuild/p67-04/brand-report.md`). It fails with 113 reconciliation failures.
  - Condition-4 files that need an Orca-family claim:
    - scripts/verify-orca-pairing-containment.mjs (95)
    - scripts/lib/firefox-bidi.mjs (9; the OrcaEnv import makes the claim unavoidable)
    - scripts/lib/pb-relaunch.mjs (4)
    - scripts/lib/mozlz4.mjs (1)
  - Held-back counts measured over this lane's tree:

    | Row | Before | After |
    |-----|--------|-------|
    | Orca | 2305 | 2313 |
    | orca | 4740 | 4755 |
    | ORCA | 942 | 943 |
    | orcad | 1327 | 1334 |

  - Re-measure after the p67-01..p67-03 merges.
- **Owner items still open:** P67-21 (the profile location stays an owner pick) and CA-07 (growth of the device registry).

## Deviations from Plan

1. **[Rule 3 - Blocking] stdout and stderr capture through environment defaults.** Phase 65's `withOrcaProfile` calls `withShell(profile, fn)` with no options, and that file is outside this lane's files_modified. `withFirefoxPage` therefore takes `stdoutPath` and the new `stderrPath` from `PB_LIVE_STDOUT_PATH` and `PB_LIVE_STDERR_PATH` when they are not passed. The containment check sets both to a `.mozbuild` work folder and removes the folder after the scan. Files: scripts/lib/firefox-bidi.mjs, scripts/verify-orca-pairing-containment.mjs. Commit c421ee3c.
2. **Structure: the shared helper lives in firefox-bidi.mjs.** pb-relaunch.mjs already imports firefox-bidi.mjs, so `removeOrcaPathsFor` and `liveProfileDir` are defined in firefox-bidi.mjs, which avoids an import cycle. pb-relaunch's dispose calls the helper and names aliasPathFor and bridgeDirFor in its comment. The plan's key_link pattern `bridgeDirFor` in pb-relaunch.mjs is therefore matched by that comment, while the import itself is in firefox-bidi.mjs.
3. **Live control marker.** The control is the random path, not the full URL. Self-test fixtures still use a full URL.
4. **Gecko magic not checked.** The lane has no upstream/, so `grep -rn mozLz40 upstream/` could not run. The header layout follows the plan's stated facts.

## Known Stubs

None. The live mode is complete but has never run. It is a coordinator proof (see Risks).

## Risks for the coordinator run

- **Session restore may be blind.** The session restore control assumes a PB web tab reaches sessionstore. If the shell's web-tab overlays never reach sessionstore, the live row goes red "collector blind" for session restore. That red is correct, and the fix is to also open the marker in a stock window (`powerbrowser.open-browser-window`) and close it before quit.
- **Address field may be blind.** The address field reads `.pb-chrome-bar-input` after activating each tab. If the pill does not render for an Orca tab, those texts are empty, but only the control web tab's text is required.
- **Theia backend pid assumed.** The listener collector takes the Theia backend pid from `TheiaService.getState().pid`.

## Threat Flags

None. No new endpoint or trust boundary was added. The check reads local files and /proc, and the served marker page binds 127.0.0.1.

## Self-Check: PASSED

- Files: scripts/verify-orca-pairing-containment.mjs (369 lines), scripts/lib/mozlz4.mjs (contains mozLz40), scripts/lib/orca-offer-scan.mjs (contains "collector blind"). All are present.
- Commits: e3be9ced, 5a9c301d and c421ee3c are ancestors of HEAD.
- The lane diff against the base lists only files_modified paths.
