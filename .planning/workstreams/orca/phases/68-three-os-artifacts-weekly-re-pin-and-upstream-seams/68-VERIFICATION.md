---
phase: 68-three-os-artifacts-weekly-re-pin-and-upstream-seams
verified: 2026-11-14T01:11:25Z
status: gaps_found
score: 6/11 must-haves verified
covered_files: [".github/workflows/rebase-orca.yml",".github/workflows/release-train.yml",".github/workflows/release.yml",".planning/workstreams/orca/phases/68-three-os-artifacts-weekly-re-pin-and-upstream-seams/68-01-PLAN.md",".planning/workstreams/orca/phases/68-three-os-artifacts-weekly-re-pin-and-upstream-seams/68-01-SUMMARY.md",".planning/workstreams/orca/phases/68-three-os-artifacts-weekly-re-pin-and-upstream-seams/68-02-PLAN.md",".planning/workstreams/orca/phases/68-three-os-artifacts-weekly-re-pin-and-upstream-seams/68-02-SUMMARY.md",".planning/workstreams/orca/phases/68-three-os-artifacts-weekly-re-pin-and-upstream-seams/68-03-PLAN.md",".planning/workstreams/orca/phases/68-three-os-artifacts-weekly-re-pin-and-upstream-seams/68-03-SUMMARY.md",".planning/workstreams/orca/phases/68-three-os-artifacts-weekly-re-pin-and-upstream-seams/68-04-PLAN.md",".planning/workstreams/orca/phases/68-three-os-artifacts-weekly-re-pin-and-upstream-seams/68-04-SUMMARY.md",".planning/workstreams/orca/phases/68-three-os-artifacts-weekly-re-pin-and-upstream-seams/68-05-PLAN.md",".planning/workstreams/orca/phases/68-three-os-artifacts-weekly-re-pin-and-upstream-seams/68-05-SUMMARY.md",".planning/workstreams/orca/phases/68-three-os-artifacts-weekly-re-pin-and-upstream-seams/68-06-PLAN.md",".planning/workstreams/orca/phases/68-three-os-artifacts-weekly-re-pin-and-upstream-seams/68-06-SUMMARY.md",".planning/workstreams/orca/phases/68-three-os-artifacts-weekly-re-pin-and-upstream-seams/68-07-PLAN.md",".planning/workstreams/orca/phases/68-three-os-artifacts-weekly-re-pin-and-upstream-seams/68-07-SUMMARY.md",".planning/workstreams/orca/phases/68-three-os-artifacts-weekly-re-pin-and-upstream-seams/68-08-PLAN.md",".planning/workstreams/orca/phases/68-three-os-artifacts-weekly-re-pin-and-upstream-seams/68-08-SUMMARY.md",".planning/workstreams/orca/phases/68-three-os-artifacts-weekly-re-pin-and-upstream-seams/68-09-PLAN.md",".planning/workstreams/orca/phases/68-three-os-artifacts-weekly-re-pin-and-upstream-seams/68-09-SUMMARY.md",".planning/workstreams/orca/phases/68-three-os-artifacts-weekly-re-pin-and-upstream-seams/68-10-PLAN.md",".planning/workstreams/orca/phases/68-three-os-artifacts-weekly-re-pin-and-upstream-seams/68-10-SUMMARY.md","bundled-extensions/claude-agent-sdk/package.json","flatpak/org.debios.PowerBrowser.json","inventory/licence-allowlist.json","orca-overlay/patches/070-claude-agent-sdk-dir.patch","orca-overlay/patches/080-orcad-external-claude-agent-sdk.patch","orca-overlay/seams.json","powerbrowser/packaging/bundled-xpi.json","powerbrowser/packaging/package-linux.sh","powerbrowser/packaging/package-macos.sh","powerbrowser/packaging/package-windows.sh","powerbrowser/shell/OrcaEnv.sys.mjs","powerbrowser/shell/OrcaService.sys.mjs","scripts/build-orca.sh","scripts/detect-upstreams.mjs","scripts/export-orca-seam-pr.mjs","scripts/rebase-orca.sh","scripts/release-train.mjs","scripts/verify-bundled-extensions.mjs","scripts/verify-bundled-xpi.mjs","scripts/verify-licence-allowlist.mjs","scripts/verify-orca-claude-sdk.mjs","scripts/verify-orca-mobile-protocol.mjs","scripts/verify-orca-overlay.mjs","scripts/verify-orca-packaged-live.mjs","scripts/verify-orca-packaged-tree.mjs","scripts/verify-platform.sh"]
covered_digest: "v3:sha256:41232e81464b6b129b69fbd311660eb9e86c140986ee93efde139021dda78f4e"
behavior_unverified: 0
overrides_applied: 0
requirements:
  OVL-02:
    status: blocked
    plans: ["68-02", "68-06"]
    evidence: "Re-pin wiring is complete: release-train sweep-clock orcaDue, detect-orca, rebase-orca.yml, bump-pr-orca with auto-merge, and a stop issue. rebase-orca-self-test passes. On the current tree the replay stops at its typecheck-coverage stage, because 3 of the 9 orca-overlay/files paths are outside both Orca typecheck programs (gap 1). The only real replay, the 68-06 identity re-pin, ran when 0 overlay files existed."
    human: "The first live weekly tick, the bump PR and the owner's approving review need main pushed (deferred)."
  OVL-03:
    status: needs_human
    plans: ["68-03", "68-06"]
    evidence: "orca-mobile-protocol was run here against the fetched Orca tree: PASS, 1779 protected files, 3 seams and 9 overlay files outside it. orca-mobile-protocol-self-test and orca-mobile-skew-self-test PASS. orca-mobile-skew is recorded PASS in 68-06 (8 tags behind, verdict ok)."
    human: "Pairing the stock Android app with PowerBrowser's orcad (owner, needs an Android device)."
  OVL-06:
    status: needs_human
    plans: ["68-03", "68-05", "68-06"]
    evidence: "export-orca-seam-pr --self-test PASS. seams.json has an upstream key on all 3 rows, and seam 010 is the browser-provider class. The upstream test exists under orca-overlay/upstream/010-installed-electron-switch. orca-upstream-prs is red by design, as expected, and excluded under WINDOWS 51."
    human: "The owner opens the issue and the PR and records the URL (WINDOWS 51). The owner rules on the web-entry class, which has no seam (WINDOWS 52)."
  PLAT-01:
    status: needs_human
    plans: ["68-01", "68-04", "68-06", "68-10"]
    evidence: "release.yml has a build-linux Orca step, windows-orca on windows-latest, and macos-orca-arm64, -x64 and -universal. All three package scripts stage <GreD>/orca, and the Flatpak manifest has --filesystem=home. release-shape, win-sign-chain and flathub-manifest each PASS here, with their self-tests. orca-packaged-tree and orca-packaged-live are recorded PASS on the dev-objdir Linux package (68-06)."
    human: "The container release tarball (WINDOWS 30). The first release.yml runs of windows-orca, build-windows and the macOS jobs. The macOS artifact (WINDOWS 48). The 68-B ruling and the 68-A terms check (WINDOWS 44). The release guard stays closed until WINDOWS 44 resolves."
  PLAT-02:
    status: needs_human
    plans: ["68-01", "68-06"]
    evidence: "The 68-06 Linux pass ran 38 rows: 35 PASS. Two reds are owner-gated by design (orca-licence-rulings WINDOWS 44, orca-upstream-prs WINDOWS 51). The third is orca-tabs-live g3, red since Phase 64 (TAB-04, WINDOWS 55). The gate at d55a380b had 2 non-excluded reds, since recorded as flaky (WINDOWS 57, 58) and excluded."
    human: "orca-tabs-live g3 (TAB-04) needs a drive or an owner override. macOS and Windows smoke tests (WINDOWS 49, 50) need hosts."
  BEXT-01:
    status: satisfied
    plans: ["68-04", "68-07", "68-09", "68-06"]
    evidence: "Seam 080 adds the SDK to ORCAD_EXTERNAL_MODULES, and seam 070 has loadClaudeAgentSdk read ORCA_CLAUDE_AGENT_SDK_DIR. OrcaEnv.claudeAgentSdkDir returns an empty string when Theia has the extension disabled. Run here: orca-claude-sdk PASS (S1 and S5 load, S2-S4 reject), orca-claude-sdk-self-test PASS (8 plants), bundled-extensions PASS and its self-test PASS. Recorded in 68-06: orca-claude-sdk-built and bundled-extensions-live PASS."
    human: "The owner confirms that Anthropic's terms permit redistribution (68-A, WINDOWS 44)."
  BEXT-02:
    status: satisfied
    plans: ["68-08", "68-06"]
    evidence: "powerbrowser/packaging/bundled-xpi.json pins uBlock0@raymondhill.net 1.76.0, and all three package scripts stage it. THIRD-PARTY-NOTICES.txt:34911 lists GPL-3.0-or-later, and the licence-allowlist row exists. bundled-xpi and bundled-xpi-self-test PASS here. Recorded in 68-06: bundled-xpi-packaged and bundled-xpi-live PASS on the package (install, filter, relaunch, disable, remove)."
    human: "The owner's GPL-3.0 section 6 reading (WINDOWS 44)."
gaps:
  - truth: "The re-pin job runs Orca's typecheck:web and typecheck:node over PowerBrowser's added files and re-pins by itself when green (SC1, OVL-02)"
    status: failed
    reason: "rebase-orca.sh stage_coverage requires every orca-overlay/files path to be in tsc --listFilesOnly of config/tsconfig.tc.web.json or config/tsconfig.node.json. Three overlay files added in Phases 64-66 are in neither program: pb-css-scope.mjs, vite.pb-browser-host.config.ts and vite.pb-panes.config.ts. config/tsconfig.node.json includes only ../electron.vite.config.* at the Orca root, and nothing in either program imports these files. This was confirmed by running tsc --listFilesOnly on both programs over the fetched Orca tree: 39639 lines, only the 6 src/renderer/src/pb files appear. Every replay on the current tree therefore stops at 'typecheck coverage pb-css-scope.mjs is in neither typecheck program', so the weekly job can never go green and never opens a bump PR. The one real replay (68-06 identity re-pin, .mozbuild/p68-06/identity-repin.log, 2026-11-10 14:10) logged '0 overlay files at this pin (vacuous)': it ran before the Phase 64-66 overlay files merged. No gate row runs stage_coverage over the real overlay, so --quick and --gate cannot see this."
    artifacts:
      - path: "scripts/rebase-orca.sh"
        issue: "stage_coverage (lines 182-201) checks every file under orca-overlay/files, including the Vite build configs and the .mjs helper, which no Orca typecheck program covers"
      - path: "orca-overlay/files/pb-css-scope.mjs"
        issue: "outside both typecheck programs"
      - path: "orca-overlay/files/vite.pb-panes.config.ts"
        issue: "outside both typecheck programs"
      - path: "orca-overlay/files/vite.pb-browser-host.config.ts"
        issue: "outside both typecheck programs"
    missing:
      - "Have the three root build files typechecked, or covered by a stated rule. Options: a PB-owned tsconfig program that includes them, run as a third typecheck stage, or a declared, self-tested exemption for build configs that verify-orca-pane-entry or the browser-host build already proves. Do not silently drop them from the coverage list."
      - "Re-run the identity re-pin (scripts/rebase-orca.sh --tag <pin> --commit <pin commit>) on the current tree, and record a PASS that names a non-zero overlay file count"
      - "Optionally, a quick-tier row that runs stage_coverage's listing against the real overlay when orca/ is built, so a new overlay file outside both programs goes red at commit time rather than on the weekly tick"
deferred: []
human_verification:
  - test: "First live weekly re-pin tick after main is pushed (and after gap 1 is fixed): release-train sweep-clock orca-due, detect-orca, rebase-orca.yml, then bump-pr-orca"
    expected: "A green replay opens chore/orca-<tag> with auto-merge armed and the owner approves it. A red replay writes one 'release-train: orca <tag> stopped' issue"
    why_human: "Needs the pushed repository, the Worker clock and GitHub Actions (OVL-02)"
  - test: "Pair the stock Orca Android app with PowerBrowser's orcad beside the orca-mobile-skew output"
    expected: "Pairing succeeds; the lag report matches the app's version"
    why_human: "Needs an Android device (OVL-03, P68-17)"
  - test: "Open the upstream issue and then the PR for seam 010 (browser-provider); record the URL in seams.json upstream.pr; rule on the web-entry class"
    expected: "orca-upstream-prs goes green or the web-entry class is ruled out of SC3"
    why_human: "Owner action under the org move (OVL-06, WINDOWS 51, 52)"
  - test: "A release.yml dispatch producing the Linux container tarball, windows-orca, build-windows and the macOS Orca jobs"
    expected: "Each artifact carries <GreD>/orca with its target's node-pty slot; orca-packaged-tree passes per target"
    why_human: "Needs the push, the release runner, the Safe Browsing key directory and hosted runners (PLAT-01, WINDOWS 30, 48)"
  - test: "Owner licence items: ruling 68-B, the 68-A Anthropic terms check, the GPL-3.0 section 6 reading for uBlock Origin"
    expected: "orca-licence-rulings goes green, so the release guard opens"
    why_human: "Owner rulings (WINDOWS 44); they gate PLAT-01's release and the BEXT-01/BEXT-02 shipping posture"
  - test: "orca-tabs-live stage g3 (tab-groups-cross-client), or an owner override"
    expected: "The second client shows the tab, or TAB-04 g3 is ruled out of PLAT-02's Linux pass"
    why_human: "A Phase 64 red (TAB-04, WINDOWS 55) that the Phase 64 verification already carries as gaps_found"
  - test: "macOS and Windows smoke tests of a build with Orca"
    expected: "orcad starts from <GreD>/orca on the packaged Node and pairs a web tab"
    why_human: "Needs a Mac and the Windows 11 VM (PLAT-02, D-24, WINDOWS 49, 50; the Windows claude-wrapper launcher is WINDOWS 53)"
---

# Phase 68: Three-OS artifacts, weekly re-pin and upstream seams Verification Report

**Phase Goal:** The Orca integration ships in Linux, macOS and Windows artifacts and passes live checks on Linux. An automated weekly re-pin keeps it current with Orca releases, and the stock mobile app still pairs.
**Verified:** 2026-11-14T01:11:25Z, tree 5d05e3ad (ServerDestroyer/v1.7-Orca-integration)
**Status:** gaps_found
**Re-verification:** No. This is the initial verification.

Method: static only. Static rows and self-tests ran in this worktree. Rows that need orca/ or theia/node_modules ran against the fetched trees in the v1.7 checkout, which were symlinked in read-only and removed before the commit. No PowerBrowser, orcad, build or live row was launched. Live evidence is cited from 68-06-SUMMARY.md and from the gate at d55a380b.

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | SC1a: the release-train clock dispatches the re-pin weekly, with no `schedule:` key (D-77) | ✓ VERIFIED | release-train.yml: sweep-clock `--orca-due` (line 748), then detect-orca (1004), rebase-orca (1046), which calls rebase-orca.yml, then bump-pr-orca (1059). rebase-orca.yml has workflow_dispatch and workflow_call only. Run here: `workflows` PASS (rules no-schedule and orca-repin), `verify-upstream-pins` PASS, and `release-train.mjs --self-test` PASS, including the orcaDue ISO-week cases (release-train.mjs:2382-2388) |
| 2 | SC1b: the job moves the pin, re-applies the seams, runs typecheck:web and typecheck:node over PB's added files and the brand scan, and re-pins by itself when green | ✗ FAILED | The stages exist in this order: pin-move, fetch, seam-apply, build, typecheck x2, coverage, rows, orcad, notices, brand (rebase-orca.sh:254-265). On the current tree, stage_coverage stops: pb-css-scope.mjs, vite.pb-browser-host.config.ts and vite.pb-panes.config.ts are in neither Orca typecheck program, confirmed with tsc --listFilesOnly on both. The job can never go green. The identity re-pin PASS ran with 0 overlay files (see Gaps) |
| 3 | SC1c: a planted conflict and a planted type error each stop the job, and a stop produces a report for a human | ✓ VERIFIED | `bash scripts/rebase-orca.sh --self-test` run here: PASS. Seam conflict stops at seam-apply. Type error stops at `typecheck:web src/a.ts:3`. The coverage, brand, LICENSE, row-SKIP and probe-SKIP plants each stop at their stage. Controls are green, and --replay-only touches only the bump paths. The report job writes one "release-train: orca <tag> stopped" issue (release-train.yml:1684-1706) |
| 4 | SC2a: the overlay touches none of orcad's mobile-facing protocol files | ✓ VERIFIED | `node scripts/verify-orca-mobile-protocol.mjs` run here against the fetched Orca tree: PASS. 1779 protected files (1759 from mobile/src, 20 runtime-rpc and ipc/mobile.ts); 3 seams and 9 overlay files are outside it. Its self-test PASS (4 plants) |
| 5 | SC2b: the stock Orca mobile app pairs with PB's orcad, and the report states the pin lag | ? UNCERTAIN (human) | The lag half is wired: orca-mobile-skew is recorded PASS in 68-06 (pin 8 tags behind v1.4.256, stock app 0.0.64, verdict ok), and `--skew-self-test` PASSes here (4 plants). Pairing needs an Android device |
| 6 | SC3: the browser-provider and web-entry seams each have an upstream PR open, linked from the seam table, and PB's build does not depend on their acceptance | ? UNCERTAIN (owner) | seams.json carries `upstream.class`/`pr` on all 3 rows: 010 browser-provider, 070 and 080 pb-only. The export tool and upstream test exist (`export-orca-seam-pr --self-test` PASS). Every `pr` is null: the owner opens them (WINDOWS 51). No web-entry seam exists, so that half needs an owner ruling (WINDOWS 52). The build applies the seams locally and has no upstream dependency |
| 7 | SC4a: the Linux, macOS and Windows artifacts contain orcad and the overlaid client, with the node-pty prebuild built per target on its own runner | ? UNCERTAIN (first release) | Code is complete: build-linux Orca step on the self-hosted Linux runner, windows-orca on windows-latest, macos-orca-arm64 (macos-15), -x64 (macos-15-intel), -universal merge. All three package scripts stage <GreD>/orca, and orca-packaged-tree runs per target (release.yml:212, 2167, 2282, 2404). Run here: release-shape and win-sign-chain PASS with their self-tests. The Linux half is proven on the dev-objdir package (68-06: orca-packaged-tree PASS, 2894 files, node-pty slot linux-x64-glibc). The Windows, macOS and container runs are deferred |
| 8 | SC4b: the Flatpak manifest grants `--filesystem=home`, and each artifact check is one verify-platform.sh row | ✓ VERIFIED | flatpak/org.debios.PowerBrowser.json:16. flathub-manifest PASS with its self-test (23 plants). Single rows: orca-packaged-tree, orca-packaged-live, package-target-natives, build-windows-shape, win-sign-list-self-test, bundled-xpi-packaged and orca-licence-rulings are each one registry line |
| 9 | SC5: the live checks pass on Linux, and macOS/Windows smoke results are recorded when a host is available | ? UNCERTAIN (human) | 68-06 PLAT-02 pass: 35 of 38 PASS. The reds are orca-licence-rulings (owner, 44), orca-upstream-prs (owner, 51) and orca-tabs-live g3 (Phase 64 TAB-04, WINDOWS 55). The --gate at d55a380b had 2 non-excluded reds, since recorded flaky (57, 58). No Mac and no Windows host is available (49, 50) |
| 10 | BEXT-01: the Claude agent SDK is not bundled into orcad. It ships in a pre-installed, removable Theia extension; when on, the chat session loads it, and when off or removed, it reports the package missing | ✓ VERIFIED | Seam 080 makes the SDK external, and seam 070's importSdkFrom rejects with ERR_MODULE_NOT_FOUND for "" or a missing directory. OrcaEnv.claudeAgentSdkDir returns "" when disabled (OrcaEnv.sys.mjs:154-166), and OrcaService passes it in (OrcaService.sys.mjs:414). Run here: orca-claude-sdk PASS (S1 and S5 loaded, S2-S4 rejected), its self-test PASS (8 plants), and bundled-extensions PASS with its self-test. Recorded in 68-06: orca-claude-sdk-built (needle in none of 9705 orca/out files) and bundled-extensions-live PASS |
| 11 | BEXT-02: uBlock Origin ships pre-installed and enabled at a pinned version and sha256, unmodified, can be disabled or removed, and is listed in the notices | ✓ VERIFIED | bundled-xpi.json pin. stage-bundled-xpi.sh runs from package-linux, -macos and -windows. THIRD-PARTY-NOTICES.txt:34911-34913, and licence-allowlist.json:66-70. Run here: bundled-xpi and bundled-xpi-self-test PASS. Recorded in 68-06 on the package: bundled-xpi-packaged and bundled-xpi-live PASS (install, filter, relaunch, disable, remove) |

**Score:** 6/11 truths verified, 1 failed, 4 need a human or owner, 0 present but behavior-unverified.

Behavior-dependent truths: truth 3 (stop transitions) is backed by the named self-test run here. Truth 10's load and reject paths are backed by orca-claude-sdk's S1-S5 child-node runs, which ran here.

### Required Artifacts

`verify.artifacts` across the 10 plans: 37/38 pass. The one miss is a tool shape, not a gap: 68-05 lists the directory `orca-overlay/upstream/`, which exists with `010-installed-electron-switch/`. `verify.key-links`: 34/36. The two misses are 68-05's directory source (EISDIR) and 68-06's git-ref "from". Both are shape errors in the plan frontmatter. The merges are ancestors of HEAD per the 68-06 self-check.

| Artifact | Status | Details |
|----------|--------|---------|
| `.github/workflows/rebase-orca.yml` | ✓ VERIFIED | Read-only token, no schedule, stage and notices outputs |
| `scripts/rebase-orca.sh` | ⚠️ WIRED, BLOCKED ON TREE | Self-test green; the real replay stops at coverage on the current overlay (gap 1) |
| `.github/workflows/release-train.yml` (detect-orca, rebase-orca, bump-pr-orca, report) | ✓ VERIFIED | Wired from sweep-clock orca-due or dispatch repin-orca |
| `scripts/verify-orca-mobile-protocol.mjs` | ✓ VERIFIED | Ran green on the fetched tree |
| `scripts/export-orca-seam-pr.mjs`, `orca-overlay/upstream/010-*` | ✓ VERIFIED | Self-test green; nothing opened upstream (owner) |
| `.github/workflows/release.yml` Orca jobs, the 3 package scripts | ✓ VERIFIED (static) | release-shape and win-sign-chain green; not yet run on GitHub |
| `orca-overlay/patches/070,080`, `OrcaEnv`/`OrcaService` SDK wiring, `bundled-extensions/claude-agent-sdk` | ✓ VERIFIED | Checks green |
| `powerbrowser/packaging/bundled-xpi.json`, `stage-bundled-xpi.sh` | ✓ VERIFIED | Checks green |
| `flatpak/org.debios.PowerBrowser.json` | ✓ VERIFIED | `--filesystem=home` |

### Key Link Verification

| From | To | Via | Status |
|------|----|-----|--------|
| release-train sweep-clock | detect-orca | `orca-due` output, `if: inputs.repin-orca \|\| orca-due == 'true'` | WIRED |
| detect-orca | rebase-orca.yml | `uses:` with tag and commit | WIRED |
| rebase-orca.yml | bump-pr-orca | `stage == 'replayed'` | WIRED; never true on the current tree (gap 1) |
| rebase-orca stage | report job stop issue | `ORCA_STAGE` contains `FAIL -- ` | WIRED |
| OrcaService | orcad env ORCA_CLAUDE_AGENT_SDK_DIR | buildOrcadEnv `claudeAgentSdkDir` | WIRED |
| loadClaudeAgentSdk | extension's deployed SDK | seam 070 importSdkFrom | WIRED |
| package-{linux,macos,windows}.sh | <GreD>/orca and distribution/extensions | staging plus orca-packaged-tree / bundled-xpi --packaged | WIRED |

### Behavioral Spot-Checks (run in this worktree)

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| Re-pin stops on conflict and type error | `bash scripts/rebase-orca.sh --self-test` | PASS, 7 plants each stop at their named stage | ✓ PASS |
| Weekly tick logic and Orca selector | `node scripts/release-train.mjs --self-test`; `node scripts/detect-upstreams.mjs --self-test` | PASS (79 plants); PASS (8 Orca selector cases) | ✓ PASS |
| Workflow rules (no-schedule, orca-repin) | `node scripts/verify-workflows.mjs` (+ `--self-test`) | PASS (264 plants) | ✓ PASS |
| Mobile protocol untouched | `node scripts/verify-orca-mobile-protocol.mjs` | PASS, 1779 protected files | ✓ PASS |
| Overlay seams and upstream key | `node scripts/verify-orca-overlay.mjs` (+ `--self-test`) | PASS (29 plants) | ✓ PASS |
| Upstream PRs recorded | `node scripts/verify-orca-overlay.mjs --upstream-prs` | FAIL: browser-provider and web-entry have no PR | ✗ by design (WINDOWS 51) |
| Typecheck coverage of overlay files | `tsc --listFilesOnly -p config/tsconfig.tc.web.json` and `-p config/tsconfig.node.json` in the fetched orca/ | 6 of 9 overlay files listed; pb-css-scope.mjs and both vite.pb-*.config.ts absent | ✗ FAIL (gap 1) |
| SDK load and reject paths | `node scripts/verify-orca-claude-sdk.mjs` (+ `--self-test`) | PASS S1-S5; PASS 8 plants | ✓ PASS |
| Bundled extension and XPI | `verify-bundled-extensions.mjs`, `verify-bundled-xpi.mjs` (+ self-tests) | PASS; cached-XPI legs SKIP (no cache here) | ✓ PASS |
| Release shape, Windows signing, Flatpak | `verify-release-shape.mjs`, `verify-win-sign-chain.mjs`, `verify-flathub-manifest.mjs` (+ self-tests) | PASS | ✓ PASS |
| Packaged-tree and live verdict logic | `verify-orca-packaged-tree.mjs --self-test`, `verify-orca-packaged-live.mjs --self-test`, `lib/orca-artifacts.mjs --self-test`, `verify-build-orca-portable.mjs --self-test` | PASS | ✓ PASS |
| Licence rulings | `verify-licence-allowlist.mjs --rulings` | exit 1, PENDING 68-B and 68-A | ✗ by design (WINDOWS 44) |
| Brand scan | `node scripts/scan-brand-residue.mjs` | PASS, 835 files | ✓ PASS |
| Windows shape | `verify-build-windows-shape.mjs`; `win-sign-list.mjs --self-test` | instrument red: no upstream/ in this worktree | ? SKIP (recorded PASS at the p68-10 merge, 68-06) |

### Probe Execution

No `scripts/*/tests/probe-*.sh` is declared by the Phase 68 plans. Step 7c: not applicable.

### Requirements Coverage

| Requirement | Source Plans | Status | Evidence |
|-------------|--------------|--------|----------|
| OVL-02 | 68-02, 68-06 | ✗ BLOCKED | Gap 1 (the replay stops at coverage on the current tree); the live tick is deferred |
| OVL-03 | 68-03, 68-06 | ? NEEDS HUMAN | Protocol untouched (verified); the lag is reported (recorded); Android pairing is pending |
| OVL-06 | 68-03, 68-05, 68-06 | ? NEEDS HUMAN | Export ready; owner opens the PR (WINDOWS 51); web-entry ruling (WINDOWS 52) |
| PLAT-01 | 68-01, 68-04, 68-06, 68-10 | ? NEEDS HUMAN | Static wiring verified; Linux dev-objdir package proven; release runs and rulings pending (WINDOWS 30, 44, 48) |
| PLAT-02 | 68-01, 68-06 | ? NEEDS HUMAN | Linux 35/38 recorded; g3 red (WINDOWS 55); hosts pending (WINDOWS 49, 50) |
| BEXT-01 | 68-04, 68-07, 68-09, 68-06 | ✓ SATISFIED | Truth 10; the owner terms check stays open (WINDOWS 44) |
| BEXT-02 | 68-08, 68-06 | ✓ SATISFIED | Truth 11; the GPL-3.0 s6 reading stays open (WINDOWS 44) |

No orphaned requirements. REQUIREMENTS.md maps exactly these seven ids to Phase 68.

### Anti-Patterns Found

The debt-marker scan (TBD/FIXME/XXX, TODO/HACK/PLACEHOLDER) over the Phase 68 workflows, scripts, package scripts, OrcaService and OrcaEnv, seams.json and the bundled-extensions source found nothing.

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| scripts/rebase-orca.sh | 189-191 | The coverage stage passed vacuously ("0 overlay files at this pin"), and that is the only real-tree run on record | 🛑 Blocker (gap 1) | The evidence for OVL-02 predates the overlay it must cover |
| theia/extensions/orca-agents/src/node/claude-wrapper-launcher.ts | — | POSIX-only launcher (WINDOWS 53, unmet-truth) | ⚠️ Warning | Claude agent hooks in the Windows artifact; surfaces at the Windows smoke test |
| scripts/lib/firefox-bidi.mjs | — | Signal-ended packaged rows leave orcad running (WINDOWS 54; fix 0ea32a1a landed, entry open) | ℹ️ Info | Test hygiene only |
| scripts/verify-platform.sh | 7044-7045 | orca-packaged-tree/-live excluded under 30 although they pass on the dev objdir | ℹ️ Info | The default run looks for objdir-release, so the exclusion is still accurate |

### Human Verification Required

1. **First live weekly re-pin tick.** Push main, fix gap 1 first, then let sweep-clock fire or dispatch with repin-orca=true. Expected: a green replay opens chore/orca-<tag> with auto-merge armed; a red one writes one stop issue. Deferred: needs the push and the clock.
2. **Stock Android app pairing.** Expected: it pairs, and the lag matches orca-mobile-skew. Owner: needs a device.
3. **Upstream PR for seam 010 and the web-entry ruling.** Owner action: WINDOWS 51 and 52.
4. **First release.yml run with the Orca jobs, plus the container tarball.** Deferred: needs the push and the release runner (WINDOWS 30, 48).
5. **Licence rulings 68-B, 68-A and the GPL-3.0 s6 reading.** Owner: WINDOWS 44. These gate the release guard.
6. **orca-tabs-live g3, driven or overridden.** Owner: Phase 64 TAB-04, WINDOWS 55.
7. **macOS and Windows smoke tests.** Hosts: WINDOWS 49 and 50; the Windows launcher is WINDOWS 53.

### Gaps Summary

There is one real code gap, and it breaks OVL-02's main promise. Phases 64-66 added three root-level build files to `orca-overlay/files/`: `pb-css-scope.mjs`, `vite.pb-panes.config.ts` and `vite.pb-browser-host.config.ts`. Neither of Orca's typecheck programs includes them. `rebase-orca.sh` correctly refuses an overlay file it cannot typecheck, so on today's tree every weekly replay stops at `typecheck coverage` before the rows, and a bump PR is never opened. The phase's evidence for the re-pin is the 68-06 identity replay, which ran on 2026-11-10 when the overlay held no files ("vacuous"). No gate row exercises the coverage stage against the real overlay. That is why `--quick`, `--gate` and the v1.7 milestone audit all missed it.

Everything else in the phase is either verified in code with checks run here (SC1a, SC1c, SC2a, SC4b, BEXT-01, BEXT-02), or blocked only by the push and first release (the weekly tick, the release.yml Orca jobs, the container tarball). The remaining items need owner rulings (WINDOWS 44, 51, 52), hardware (Android, Mac, Windows; WINDOWS 48-50, 53), or a Phase 64 carry-over (WINDOWS 55). Those are human_needed items, not code gaps. Phase 68 is the last phase of the milestone, so nothing defers to a later phase.

---

_Verified: 2026-11-14T01:11:25Z_
_Verifier: Claude (gsd-verifier)_
