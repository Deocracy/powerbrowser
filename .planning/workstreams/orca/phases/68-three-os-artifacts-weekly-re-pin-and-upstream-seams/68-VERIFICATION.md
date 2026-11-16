---
phase: 68-three-os-artifacts-weekly-re-pin-and-upstream-seams
verified: 2026-11-16T14:37:19Z
status: human_needed
score: 8/13 must-haves verified
covered_files: [".github/workflows/rebase-orca.yml",".github/workflows/release-train.yml",".github/workflows/release.yml",".planning/workstreams/orca/phases/68-three-os-artifacts-weekly-re-pin-and-upstream-seams/68-01-PLAN.md",".planning/workstreams/orca/phases/68-three-os-artifacts-weekly-re-pin-and-upstream-seams/68-01-SUMMARY.md",".planning/workstreams/orca/phases/68-three-os-artifacts-weekly-re-pin-and-upstream-seams/68-02-PLAN.md",".planning/workstreams/orca/phases/68-three-os-artifacts-weekly-re-pin-and-upstream-seams/68-02-SUMMARY.md",".planning/workstreams/orca/phases/68-three-os-artifacts-weekly-re-pin-and-upstream-seams/68-03-PLAN.md",".planning/workstreams/orca/phases/68-three-os-artifacts-weekly-re-pin-and-upstream-seams/68-03-SUMMARY.md",".planning/workstreams/orca/phases/68-three-os-artifacts-weekly-re-pin-and-upstream-seams/68-04-PLAN.md",".planning/workstreams/orca/phases/68-three-os-artifacts-weekly-re-pin-and-upstream-seams/68-04-SUMMARY.md",".planning/workstreams/orca/phases/68-three-os-artifacts-weekly-re-pin-and-upstream-seams/68-05-PLAN.md",".planning/workstreams/orca/phases/68-three-os-artifacts-weekly-re-pin-and-upstream-seams/68-05-SUMMARY.md",".planning/workstreams/orca/phases/68-three-os-artifacts-weekly-re-pin-and-upstream-seams/68-06-PLAN.md",".planning/workstreams/orca/phases/68-three-os-artifacts-weekly-re-pin-and-upstream-seams/68-06-SUMMARY.md",".planning/workstreams/orca/phases/68-three-os-artifacts-weekly-re-pin-and-upstream-seams/68-07-PLAN.md",".planning/workstreams/orca/phases/68-three-os-artifacts-weekly-re-pin-and-upstream-seams/68-07-SUMMARY.md",".planning/workstreams/orca/phases/68-three-os-artifacts-weekly-re-pin-and-upstream-seams/68-08-PLAN.md",".planning/workstreams/orca/phases/68-three-os-artifacts-weekly-re-pin-and-upstream-seams/68-08-SUMMARY.md",".planning/workstreams/orca/phases/68-three-os-artifacts-weekly-re-pin-and-upstream-seams/68-09-PLAN.md",".planning/workstreams/orca/phases/68-three-os-artifacts-weekly-re-pin-and-upstream-seams/68-09-SUMMARY.md",".planning/workstreams/orca/phases/68-three-os-artifacts-weekly-re-pin-and-upstream-seams/68-10-PLAN.md",".planning/workstreams/orca/phases/68-three-os-artifacts-weekly-re-pin-and-upstream-seams/68-10-SUMMARY.md",".planning/workstreams/orca/phases/68-three-os-artifacts-weekly-re-pin-and-upstream-seams/68-11-PLAN.md",".planning/workstreams/orca/phases/68-three-os-artifacts-weekly-re-pin-and-upstream-seams/68-11-SUMMARY.md","bundled-extensions/claude-agent-sdk/README.md","bundled-extensions/claude-agent-sdk/package.json","flatpak/org.debios.PowerBrowser.json","inventory/licence-allowlist.json","orca-overlay/files/pb-css-scope.mjs","orca-overlay/patches/070-claude-agent-sdk-dir.patch","orca-overlay/patches/080-orcad-external-claude-agent-sdk.patch","orca-overlay/seams.json","orca-overlay/tsconfig.pb-build.json","powerbrowser/packaging/bundled-xpi.json","powerbrowser/packaging/package-linux.sh","powerbrowser/packaging/package-macos.sh","powerbrowser/packaging/package-windows.sh","powerbrowser/shell/OrcaEnv.sys.mjs","powerbrowser/shell/OrcaService.sys.mjs","scripts/build-orca.sh","scripts/detect-upstreams.mjs","scripts/export-orca-seam-pr.mjs","scripts/rebase-orca.sh","scripts/release-train.mjs","scripts/verify-bundled-extensions.mjs","scripts/verify-bundled-xpi.mjs","scripts/verify-licence-allowlist.mjs","scripts/verify-live-scratch-home.mjs","scripts/verify-orca-claude-sdk.mjs","scripts/verify-orca-mobile-protocol.mjs","scripts/verify-orca-overlay.mjs","scripts/verify-orca-packaged-live.mjs","scripts/verify-orca-packaged-tree.mjs","scripts/verify-platform.sh","scripts/verify-shell-error-copy.mjs","theia/extensions/bundled-extensions/package.json","theia/extensions/bundled-extensions/src/browser/bundled-extensions-frontend-module.ts","theia/extensions/bundled-extensions/src/browser/reinstall-command.ts","theia/extensions/bundled-extensions/src/common/bundled-extensions-copy.ts","theia/extensions/bundled-extensions/src/common/bundled-extensions-protocol.ts","theia/extensions/bundled-extensions/src/node/bundled-extensions-backend-module.ts","theia/extensions/bundled-extensions/src/node/bundled-extensions-seed.ts","theia/extensions/bundled-extensions/src/node/bundled-extensions-service.ts"]
covered_digest: "v3:sha256:19c0fdb34a644338208b850d8e09818f721bc7e6f778b827a7b9de978c7ded19"
behavior_unverified: 1
overrides_applied: 0
re_verification:
  previous_status: gaps_found
  previous_score: 6/11
  gaps_closed:
    - "The re-pin job runs Orca's typecheck:web and typecheck:node over PowerBrowser's added files and re-pins by itself when green (SC1, OVL-02): fixed in 1edc97d6 (third typecheck program orca-overlay/tsconfig.pb-build.json, stage typecheck:pb-build, here-string coverage compare, quick row rebase-orca-coverage)"
  gaps_remaining: []
  regressions: []
requirements:
  OVL-02:
    status: needs_human
    plans: ["68-02", "68-06"]
    evidence: "Gap 1 is closed in code. Run here on the fetched, overlaid orca/ tree: rebase-orca-coverage PASS ('9 overlay file(s), each in one of 3 typecheck programs'); tsc --noEmit --composite false over config/tsconfig.tc.web.json, config/tsconfig.node.json and ../orca-overlay/tsconfig.pb-build.json each rc=0 (TypeScript 7.0.2; the third program lists the 3 root overlay files). rebase-orca-self-test PASS (9 plants, including 'the real orca-overlay/files -> green' with all 9 counted, an uncovered root file red, and a type error in a root file stopping at typecheck:pb-build). release-train-logic-self-test, detect-upstreams-self-test, workflows and verify-upstream-pins PASS."
    human: "Full identity re-pin (rebase-orca.sh --tag <pin> --commit <pin commit>) with a non-zero overlay count has not been re-run since 1edc97d6 (needs a build); the first live weekly tick, the bump PR and the owner's approving review need main pushed."
  OVL-03:
    status: needs_human
    plans: ["68-03", "68-06"]
    evidence: "orca-mobile-protocol PASS here (1779 protected files, 3 seams and 9 overlay files outside it); orca-mobile-protocol-self-test and orca-mobile-skew-self-test PASS. orca-mobile-skew (network) recorded PASS in 68-06, not re-run."
    human: "Pair the stock Orca Android app with PowerBrowser's orcad (owner, Android device). D-40 keeps this in v1.7."
  OVL-06:
    status: needs_human
    plans: ["68-03", "68-05", "68-06"]
    evidence: "D-45 is in code: verify-orca-overlay.mjs:70-71 UPSTREAM_CLASSES = ['browser-provider','pb-only'], PR_CLASSES = ['browser-provider']. seams.json: 010 browser-provider pr null, 070/080 pb-only. orca-overlay and its self-test (30 plants) PASS. orca-upstream-prs exits 1 by design: 'class browser-provider has no seams.json row with a non-null upstream pr' (WINDOWS 51, excluded in verify-platform.sh:7064). WINDOWS 52 fixed 2026-11-15."
    human: "Owner opens the upstream issue and the browser-provider PR and records the URL in seams.json (WINDOWS 51)."
  PLAT-01:
    status: needs_human
    plans: ["68-01", "68-04", "68-06", "68-10"]
    evidence: "Judged Linux only (D-40). release-shape and its self-test PASS; flathub-manifest PASS (23 plants), --filesystem=home at flatpak/org.debios.PowerBrowser.json:16. orca-licence-rulings now PASS ('no owner licence item is open', D-42/D-43/D-44), so the build-linux --rulings guard is open. licence-allowlist PASS (1271 Orca packages). Linux dev-objdir package with <GreD>/orca recorded PASS in 68-06 (orca-packaged-tree, orca-packaged-live), not re-run here."
    human: "The container-built Linux release tarball and the first release.yml run (WINDOWS 30, owner steps, re-dated to next version by D-46). macOS and Windows halves moved to the next version (D-40)."
  PLAT-02:
    status: needs_human
    plans: ["68-01", "68-06"]
    evidence: "Last Linux live pass is 68-06 (35 of 38). Two of its three reds are now cleared: orca-licence-rulings PASS here (WINDOWS 44 fixed) and web-entry dropped (WINDOWS 52 fixed). Still red: orca-upstream-prs (owner, WINDOWS 51) and orca-tabs-live stage g3 tab-groups-cross-client (WINDOWS 55, TAB-04, Phase 64 owner of the stage, open, re-dated to next version by D-46). The flaky reds 56, 57, 58 are fixed (79354809, ad9a1939). No live row was run here."
    human: "A Linux live pass on the current tree, and an owner decision on orca-tabs-live g3 (drive it green or accept WINDOWS 55's next-version date as the PLAT-02 exclusion). macOS and Windows smoke tests moved to the next version (D-40)."
  BEXT-01:
    status: satisfied
    plans: ["68-04", "68-07", "68-09", "68-11", "68-06"]
    evidence: "Run here: orca-claude-sdk PASS (S1, S5 loaded; S2-S4 rejected), its self-test PASS (8 plants), bundled-extensions PASS (new reinstall leg), bundled-extensions-seed PASS (13 scenarios: 8 seed, 5 reinstall), bundled-extensions-self-test PASS, shell-error-copy-no-internals and its self-test PASS (4 reinstall-copy plants), diff-theia-core PASS. Reinstall wiring read: reinstall-command.ts gates isVisible/isEnabled on absent.has(CLAUDE_EXTENSION_ID), refreshes on onStart and HostedPluginWatcher.onDidDeploy, calls service.reinstall only in execute; service queues calls and installs through PluginServer.install(local-dir:..., PluginType.User). D-43 confirmed the terms check."
    human: "Owner approves the reinstall copy (D-41 left copy wording open) and decides the Help-menu placement outside Coding mode; confirm 'Start a new Claude chat session to use it' in a full PowerBrowser with orcad (68-11 live row 4, not run)."
  BEXT-02:
    status: satisfied
    plans: ["68-08", "68-06"]
    evidence: "bundled-xpi PASS here (uBlock0@raymondhill.net 1.76.0, 19 filter-list hosts) and its self-test PASS; licence-allowlist PASS ('2 bundled_extensions row(s) equal the pinned XPIs'). D-44 accepted the GPL-3.0 s6 reading. bundled-xpi-packaged and bundled-xpi-live recorded PASS in 68-06."
gaps: []
deferred:
  - truth: "macOS and Windows artifacts contain orcad and the overlaid client (SC4 macOS/Windows half; release.yml windows-orca, build-windows, macos-orca-*; WINDOWS 48, 53)"
    addressed_in: "next version (owner ruling D-40, 2026-11-15)"
    evidence: "D-40: 'the macOS and Windows halves of PLAT-01 and PLAT-02 ... moved to the next version'; the code stays in the tree"
  - truth: "macOS and Windows smoke tests recorded (SC5 second sentence; WINDOWS 49, 50)"
    addressed_in: "next version (owner ruling D-40, 2026-11-15)"
    evidence: "D-40 moves both smoke tests to the next version"
behavior_unverified_items:
  - truth: "68-11: the Reinstall the Claude Extension command is visible and enabled only while the extension's folder is absent, and the absent list refreshes at frontend start and on every deploy notification (including after an uninstall)"
    test: "In a fresh profile, check the palette and Help menu; uninstall the Claude Agent SDK in the Extensions view; run the command; restart; uninstall and restart without the command"
    expected: "Hidden while present; appears after uninstall without a reload; running it restores deployedPlugins/powerbrowser.claude-agent-sdk and hides the command; nothing reinstalls it on restart"
    why_human: "The static legs check the source shape of the gate, not the frontend state transition; the coordinator's GUI pass (a)-(e) is recorded PASS in 68-11-SUMMARY.md at f6d291a0 but was not re-run here (no-browser constraint)"
human_verification:
  - test: "Identity re-pin on the current tree: scripts/rebase-orca.sh --tag <pinned tag> --commit <pin commit>, then the first live weekly tick after main is pushed"
    expected: "The replay logs a PASS that names 9 overlay files at coverage; the tick opens chore/orca-<tag> with auto-merge armed, or one 'release-train: orca <tag> stopped' issue"
    why_human: "Needs a build, then the pushed repository, the Worker clock and GitHub Actions (OVL-02)"
  - test: "Pair the stock Orca Android app with PowerBrowser's orcad beside the orca-mobile-skew output"
    expected: "Pairing succeeds; the lag report matches the app's version"
    why_human: "Needs an Android device (OVL-03; D-40 keeps Android in v1.7)"
  - test: "Open the upstream issue and the browser-provider PR for seam 010 and record the URL in seams.json upstream.pr"
    expected: "orca-upstream-prs goes green"
    why_human: "Owner action under the org move (OVL-06, WINDOWS 51)"
  - test: "Container-built Linux release tarball and the first release.yml run"
    expected: "The Linux artifact carries <GreD>/orca with the linux-x64-glibc node-pty slot; orca-packaged-tree and orca-packaged-live pass on objdir-release"
    why_human: "Needs the push, the release runner and the release keys (PLAT-01, WINDOWS 30)"
  - test: "Linux live pass on the current tree, and orca-tabs-live stage g3 driven green or accepted as excluded"
    expected: "Every Phase 68 live row green; g3 either green or recorded by the owner as the PLAT-02 exclusion under WINDOWS 55"
    why_human: "Live rows are out of scope for this static run; g3 is a Phase 64 TAB-04 red the owner dated 'next version' (D-46) without ruling it out of PLAT-02"
  - test: "Owner review of the 68-11 reinstall copy and Help-menu placement; confirm the 'Start a new Claude chat session' claim"
    expected: "Copy approved or reworded; the command added to the Application menu's Help submenu or palette-plus-Coding-mode accepted; a new chat session after reinstall loads the SDK without restarting orcad"
    why_human: "Owner copy and UI decision (D-41 left copy open); the claim needs a full PowerBrowser with orcad and a real claude (BEXT-01)"
  - test: "68-11 reinstall command visibility transitions (see behavior_unverified_items)"
    expected: "Hidden while present, offered after uninstall, never automatic"
    why_human: "Frontend state transition; no automated test exercises it"
---

# Phase 68: Three-OS artifacts, weekly re-pin and upstream seams Verification Report

**Phase Goal:** The Orca integration ships in Linux, macOS and Windows artifacts and passes live checks on Linux. An automated weekly re-pin keeps it current with Orca releases, and the stock mobile app still pairs. Judged under D-40: v1.7 is Linux only; the macOS and Windows halves are deferred to the next version.
**Verified:** 2026-11-16T14:37:19Z, tree f6d291a0 (ServerDestroyer/v1.7-Orca-integration)
**Status:** human_needed
**Re-verification:** Yes. This follows the 2026-11-14 run (gaps_found, 6/11), after 1edc97d6 (gap 1), D-40..D-46, plan 68-11, ac5aa95b/32f47718 (scratch HOME) and the WINDOWS 56-58 fixes.

Method: static only. Every row listed below was run in this worktree with `scripts/verify-platform.sh --only <label>`, against the fetched and overlaid `orca/`, `upstream/` and `theia/node_modules` present here. No `*-live` row, build or full gate was run, and no orcad or PowerBrowser process was started. Live evidence is cited from 68-06-SUMMARY.md and 68-11-SUMMARY.md and is labelled as recorded.

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | SC1a: the release-train clock dispatches the re-pin weekly, with no `schedule:` key (D-77) | ✓ VERIFIED | Run here: `workflows` PASS (no-schedule and orca-repin rules), `verify-upstream-pins` PASS (rebase-orca.yml callable and dispatchable, no schedule), `release-train-logic-self-test` PASS, `detect-upstreams-self-test` PASS |
| 2 | SC1b: the job moves the pin, re-applies the seams, runs typecheck:web and typecheck:node over PB's added files and the brand scan, and re-pins by itself when green | ✓ VERIFIED (static) | Gap 1 closed by 1edc97d6. run_replay order (rebase-orca.sh:254-266): pin-move, fetch, seam-apply, build, typecheck:web, typecheck:node, typecheck:pb-build, coverage, rows, orcad, notices, brand. Run here on the real overlay: `rebase-orca-coverage` PASS, "9 overlay file(s), each in one of 3 typecheck programs". `tsc --noEmit --composite false` over all three programs in orca/: rc=0 each. The pb-build program lists vite.pb-browser-host.config.ts, vite.pb-panes.config.ts and pb-css-scope.mjs. `rebase-orca-self-test`: "the real orca-overlay/files -> green ... coverage counted all 9". The full identity replay and the live auto-merge are human items |
| 3 | SC1c: a planted conflict and a planted type error each stop the job, and a stop produces a report for a human | ✓ VERIFIED | `rebase-orca-self-test` PASS, "9 planted faults each stopped at its named stage", including seam conflict, typecheck:web, uncovered root file and a typecheck:pb-build error. The report job writes the stop issue (release-train.yml) |
| 4 | SC2a: the overlay touches none of orcad's mobile-facing protocol files | ✓ VERIFIED | `orca-mobile-protocol` PASS (1779 protected files; 3 seams, 9 overlay files outside), self-test PASS (4 plants) |
| 5 | SC2b: the stock Orca mobile app pairs with PB's orcad, and the report states the pin lag | ? UNCERTAIN (human) | `orca-mobile-skew-self-test` PASS here; skew recorded PASS in 68-06 (network, not re-run). Pairing needs an Android device |
| 6 | SC3: the browser-provider seam has an upstream PR open, linked from the seam table; web-entry ruled out (D-45); the build does not depend on acceptance | ? UNCERTAIN (owner) | D-45 in code (verify-orca-overlay.mjs:70-71). The export and its self-test are green. `orca-upstream-prs` exits 1 with "class browser-provider has no seams.json row with a non-null upstream pr", the owner's WINDOWS 51. Seams apply locally (`orca-overlay` PASS, `orca-overlay-built` PASS: 9 markers found in out/) |
| 7 | SC4a (Linux, D-40): the Linux artifact contains orcad and the overlaid client with the node-pty prebuild built on its runner | ? UNCERTAIN (first release) | `release-shape` and its self-test PASS. `orca-licence-rulings` now PASS, so the build-linux guard opens. Recorded in 68-06: the dev-objdir package passes orca-packaged-tree (slot linux-x64-glibc) and orca-packaged-live. The container release tarball is WINDOWS 30, owner steps |
| 8 | SC4b: the Flatpak manifest grants `--filesystem=home`; each artifact check is one verify-platform.sh row | ✓ VERIFIED | flatpak/org.debios.PowerBrowser.json:16; `flathub-manifest` PASS, self-test PASS (23 plants). Each packaged check is a single registry line |
| 9 | SC5 (Linux, D-40): the live checks pass on Linux | ? UNCERTAIN (human) | The last pass is 68-06, 35 of 38. Since then, orca-licence-rulings is green here (WINDOWS 44 fixed) and the flakes 56-58 are fixed. Still red: orca-tabs-live g3 (WINDOWS 55, TAB-04, open, dated next version by D-46) and orca-upstream-prs (WINDOWS 51). Not re-run here |
| 10 | BEXT-01: the SDK is not in orcad; it ships in a pre-installed removable Theia extension; on: the session loads it; off/removed: reports it missing | ✓ VERIFIED | `orca-claude-sdk` PASS (S1, S5 loaded; S2-S4 rejected); self-test PASS (8 plants). `bundled-extensions` PASS, self-test PASS. Recorded in 68-06: orca-claude-sdk-built, bundled-extensions-live |
| 11 | BEXT-02: uBlock Origin pre-installed, pinned version and sha256, unmodified, removable, in the notices | ✓ VERIFIED | `bundled-xpi` PASS (1.76.0), self-test PASS; `licence-allowlist` PASS, its self-test PASS (19 plants). D-44 closes the GPL s6 reading |
| 12 | 68-11: the reinstall copies a shipped id only, leaves a present copy alone, never runs automatically, and its copy lives in the copy table and passes the copy check | ✓ VERIFIED | `bundled-extensions-seed` PASS: 13 scenarios, including the 5 reinstall cases (absent, present, three refused ids such as ".hidden"). `bundled-extensions` reinstall leg PASS: "reinstall is offered only while absent and never automatic". Self-test plants "a reinstall at start", "the seed copying back" and "overwrites a present copy" each go red. `shell-error-copy-no-internals` PASS and its self-test PASS (4 reinstall plants). `diff-theia-core` PASS. Reading the code: `.reinstall(` is called only in reinstall-command.ts:49 `execute`; `reinstallBundledExtension` is called only in bundled-extensions-service.ts:54 |
| 13 | 68-11: the command is visible and enabled only while the extension is absent, refreshed at start and on deploy | ⚠️ PRESENT_BEHAVIOR_UNVERIFIED | Present and wired: reinstall-command.ts:44-45 `absent.has(CLAUDE_EXTENSION_ID)`, `onStart` refresh plus `watcher.onDidDeploy`; registered in CommonMenus.HELP; RPC bound on both sides. No automated test exercises the frontend transition. The coordinator's GUI pass (a)-(e) is recorded PASS in 68-11-SUMMARY.md and was not re-run here |

**Score:** 8/13 truths verified, 0 failed, 4 need a human or owner, 1 present but behavior-unverified.

### Deferred Items (owner ruling D-40)

| # | Item | Addressed In | Evidence |
|---|------|-------------|----------|
| 1 | macOS and Windows artifacts with Orca (windows-orca, build-windows, macos-orca-*; WINDOWS 48, 53) | next version | D-40, DECISIONS.md; the code stays in the tree |
| 2 | macOS and Windows smoke tests (WINDOWS 49, 50) | next version | D-40 |

### Required Artifacts

| Artifact | Status | Details |
|----------|--------|---------|
| `scripts/rebase-orca.sh` | ✓ VERIFIED | The third program, pb_build_tsc and the here-string coverage compare are present; coverage is green on the real tree |
| `orca-overlay/tsconfig.pb-build.json` | ✓ VERIFIED | Includes `../orca/vite.pb-*.config.ts` and `../orca/pb-*.mjs`; tsc rc=0 |
| `orca-overlay/files/pb-css-scope.mjs` | ✓ VERIFIED | checkJs-clean in pb-build |
| `.github/workflows/rebase-orca.yml`, `release-train.yml` | ✓ VERIFIED | The stage list names typecheck:pb-build; `workflows` PASS |
| `scripts/verify-orca-overlay.mjs` | ✓ VERIFIED | D-45 classes at lines 70-71 |
| `inventory/licence-allowlist.json` | ✓ VERIFIED | `--rulings` PASS, no open owner item |
| `theia/extensions/bundled-extensions/src/browser/reinstall-command.ts` | ✓ VERIFIED (wired) | Contains `this.absent.has(CLAUDE_EXTENSION_ID)`; compiled into lib/browser |
| `theia/extensions/bundled-extensions/src/node/bundled-extensions-service.ts` | ✓ VERIFIED | Contains `PluginType.User`; bound via RpcConnectionHandler |
| `theia/extensions/bundled-extensions/src/common/bundled-extensions-copy.ts` | ✓ VERIFIED | REINSTALL_MESSAGES are checked by shell-error-copy-no-internals |
| `@powerbrowser/bundled-extensions` in `theia/applications/browser/package.json` | ✓ WIRED | Composed into the app |

### Key Link Verification

| From | To | Via | Status |
|------|----|-----|--------|
| rebase-orca stage_coverage | three typecheck programs | PROGRAMS[0..2], `tsc --listFilesOnly` | WIRED (9/9 covered, run here) |
| rebase-orca.yml | bump-pr-orca | `stage == 'replayed'` | WIRED. Gap 1 no longer stops the stage before it. Not yet run live |
| reinstall-command execute | BundledExtensionsService.reinstall | JSON-RPC proxy at BUNDLED_EXTENSIONS_SERVICE_PATH | WIRED |
| bundled-extensions-service | bundled-extensions-seed | `reinstallBundledExtension` reuses copyInto, `seed.sources` | WIRED |
| verify-bundled-extensions | reinstall-command.ts | checkReinstall source derivation | WIRED (PASS) |
| OrcaService | ORCA_CLAUDE_AGENT_SDK_DIR | buildOrcadEnv claudeAgentSdkDir | WIRED (orca-claude-sdk PASS) |

### Behavioral Spot-Checks (run in this worktree, 2026-11-16)

| Row / command | Result |
|---------------|--------|
| `--only rebase-orca-self-test` | PASS (9 plants) |
| `--only rebase-orca-coverage` | PASS, 9 files in 3 programs |
| `tsc --noEmit --composite false -p` tc.web / node / pb-build (in orca/) | rc=0 x3 |
| `--only bundled-extensions`, `-self-test`, `-seed` | PASS, PASS, PASS (13 scenarios) |
| `--only shell-error-copy-no-internals`, `-self-test` | PASS, PASS |
| `--only orca-overlay`, `-self-test`, `orca-overlay-built` | PASS, PASS (30 plants), PASS |
| `--only orca-upstream-prs` | FAIL (rc 1), by design: "class browser-provider has no seams.json row with a non-null upstream pr" (WINDOWS 51) |
| `--only release-shape`, `-self-test` | PASS, PASS |
| `--only orca-licence-rulings` | PASS: "no owner licence item is open" |
| `--only licence-allowlist`, `-self-test` | PASS, PASS |
| `--only orca-mobile-protocol`, `-self-test`, `orca-mobile-skew-self-test` | PASS, PASS, PASS |
| `--only orca-claude-sdk`, `-self-test` | PASS, PASS |
| `--only bundled-xpi`, `-self-test` | PASS, PASS |
| `--only flathub-manifest`, `-self-test` | PASS, PASS |
| `--only workflows`, `verify-upstream-pins`, `release-train-logic-self-test`, `detect-upstreams-self-test` | PASS x4 |
| `--only scan-brand-residue` | PASS (843 files) |
| `--only diff-theia-core`, `internals-boundary` | PASS, PASS |
| `--only live-scratch-home`, `-self-test` | PASS (25 launch sites use liveEnv), PASS |

### Probe Execution

No `scripts/*/tests/probe-*.sh` is declared by the Phase 68 plans. Not applicable.

### Requirements Coverage

| Requirement | Source Plans | Status | Evidence |
|-------------|--------------|--------|----------|
| OVL-02 | 68-02, 68-06 | ? NEEDS HUMAN | Gap 1 closed and proven on the real overlay. The identity re-pin re-run and the live tick need a build and the push |
| OVL-03 | 68-03, 68-06 | ? NEEDS HUMAN | Protocol untouched (run here); Android pairing (owner device) |
| OVL-06 | 68-03, 68-05, 68-06 | ? NEEDS HUMAN | Web-entry ruled out (D-45, in code); the browser-provider PR is the owner's (WINDOWS 51) |
| PLAT-01 | 68-01, 68-04, 68-06, 68-10 | ? NEEDS HUMAN | Linux static and dev-objdir proof; the container tarball and first release are WINDOWS 30; macOS and Windows deferred (D-40) |
| PLAT-02 | 68-01, 68-06 | ? NEEDS HUMAN | Linux live pass not re-run; g3 red (WINDOWS 55) needs a drive or an owner exclusion ruling; macOS and Windows deferred (D-40) |
| BEXT-01 | 68-04, 68-07, 68-09, 68-11, 68-06 | ✓ SATISFIED | Truths 10 and 12; owner copy and Help-placement items remain |
| BEXT-02 | 68-08, 68-06 | ✓ SATISFIED | Truth 11; D-44 closed |

No orphaned requirements: REQUIREMENTS.md maps exactly these seven ids to Phase 68.

### Anti-Patterns Found

The debt-marker scan found no TBD, FIXME, XXX, TODO, HACK or PLACEHOLDER on any added line in `git diff 78b5aea5..HEAD` (outside .planning and inventory).

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| 68-11-SUMMARY.md | Commits table | Lists 768fd88e, 76fb6e33, 9af326e8; the branch carries f526133a, 4c265724, d3ca3f23 (pre-rebase objects) | ℹ️ Info | Record only |
| theia/extensions/bundled-extensions (68-11 finding) | — | The Help menu is hidden outside Coding mode, so in other modes the command is reachable only from the palette | ⚠️ Warning | Owner UI decision |
| scripts/verify-platform.sh | 7064-7065 | orca-upstream-prs (51) and orca-tabs-live (55) excluded from --gate | ℹ️ Info | Both entries are open and owner-dated; the exclusions are accurate |

### Human Verification Required

1. **Identity re-pin and first weekly tick.** Run `scripts/rebase-orca.sh --tag <pin> --commit <pin commit>` on the current tree; expect a PASS naming 9 overlay files. After the push, expect the tick to open the bump PR or a stop issue.
2. **Stock Android app pairing.** Owner, with a device.
3. **Browser-provider upstream PR.** Owner (WINDOWS 51).
4. **Container Linux release tarball and first release.yml run.** WINDOWS 30.
5. **Linux live pass on the current tree, plus orca-tabs-live g3.** Drive it green, or the owner records it as PLAT-02's exclusion (WINDOWS 55).
6. **68-11 owner items.** Approve the copy, decide the Help-menu placement, and confirm the "new chat session" claim with orcad running.
7. **68-11 command visibility transitions.** Truth 13; the coordinator's recorded GUI pass can be accepted or repeated.

### Gaps Summary

No code gap remains. Gap 1 from 2026-11-14 is closed. A third typecheck program (`orca-overlay/tsconfig.pb-build.json`) covers the three root overlay files. Coverage on the real overlaid tree reports 9 of 9 files covered, all three programs typecheck clean, and the self-test now exercises the real overlay. Under D-40, the macOS and Windows halves are deferred. D-42, D-43 and D-44 cleared the licence guard (`orca-licence-rulings` is green). D-45 removed the web-entry PR obligation. What remains is owner, device, push and first-release work: WINDOWS 30 and 51, Android pairing, and the identity re-pin re-run, which needs a build. One live red needs an owner decision: orca-tabs-live g3 (WINDOWS 55, TAB-04). It belongs to Phase 64, and D-46 dated it "next version", but nothing rules it out of PLAT-02's "live checks pass on Linux". Until the owner accepts that exclusion or g3 is driven green, PLAT-02 cannot be marked satisfied.

---

_Verified: 2026-11-16T14:37:19Z_
_Verifier: Claude (gsd-verifier)_
