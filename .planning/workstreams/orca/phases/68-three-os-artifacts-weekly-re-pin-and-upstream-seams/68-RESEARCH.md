# Phase 68: Three-OS artifacts, weekly re-pin and upstream seams - Research

**Researched:** 2026-11-09
**Domain:** release packaging of a third-party Node daemon on three OSes (GitHub-hosted native builds admitted by digest), an automated weekly upstream re-pin through the release train, a derived protocol-isolation check, and the licence surface of a bundled JavaScript closure
**Confidence:** HIGH on tree facts (every file cited was opened or run this session). MEDIUM on hosted Windows and macOS runner behaviour (no release.yml job has ever run on GitHub; 59-05 is unexecuted). Six locked picks are contradicted or need narrowing by the tree; see "Context amendments".

<user_constraints>
## User Constraints (from 68-CONTEXT.md)

### Locked Decisions (Claude's auto-mode picks P68-01..P68-23; Chris may override)

The picks are copied by reference to keep this file readable: `.planning/workstreams/orca/phases/68-three-os-artifacts-weekly-re-pin-and-upstream-seams/68-CONTEXT.md` lines 21-105 are the locked text. Summary, in the CONTEXT's own grouping:

- **Packaged layout (P68-01):** `<GreD>/orca/` holds `package.json`, `out/orcad/`, `out/web/`, nothing else; orcad runs on the one staged Node; packaged root default in `OrcaService` (depends on Phase 62).
- **Per-OS Orca build (P68-02..P68-05):** Linux in `build-linux` on legion (`fetch-orca.sh`, then `nix develop .#orca --command bash scripts/build-orca.sh`), `package-linux.sh` stages `<GreD>/orca` and extends the patchelf loop, the checkout-path grep and precomplete; Windows on a new hosted `windows-orca` job with the `windows-sidecar` trust shape, admitted by `check-win-sidecar.sh`, `win-sign-list.mjs` learns Orca PE files from the admitted `SHA256SUMS`, no Linux job gains a `needs:` on a Windows job; macOS on hosted `macos-orca` (arm64 and x64 thin trees, digest-admitted), `package-macos.sh` stages `Contents/Resources/orca`, `universal` merges with `lipo`, arch-named files derived from Orca's `SERVER_TARGETS`/`MATRIX_SLOTS`; the missing macOS artifact is re-dated in WINDOWS.md; node-pty prebuild built only on the target's own runner by Orca's `build:orcad`.
- **Artifact checks (P68-06, P68-07):** new row `orca-packaged-tree` (+ self-test); `package-target-natives` universe moves from names to file magic; `portable-elf` and `sidecar-no-symlinks` cover `<GreD>/orca`; `release-shape` and `build-windows-shape` learn the new jobs; `--filesystem=home` joins Flatpak `finish-args` and `SANDBOX_ALLOW`.
- **Weekly re-pin (P68-08..P68-14):** `orcaDue` in `release-train.mjs` decided in `sweep-clock` (no `schedule:`), owner input `repin-orca`; `detect-orca` + `detect-upstreams.mjs --orca-select` (strict `^v[0-9]+\.[0-9]+\.[0-9]+$`, newest only, open `chore/orca-*` PR holds); `rebase-orca.yml` (shape of `rebase-upstream.yml`) runs `scripts/rebase-orca.sh` stages fetch, seam-apply, typecheck:web/node, typecheck coverage, build-orca.sh, the Orca rows, the orcad half of `orca-slotless-start`, the brand scan; green bumps only `orca_tag`, `orca_commit`, regenerated patches and `seams.json` blobs; `bump-pr-orca` arms auto-merge, no ruleset change; red opens one tracking issue from `report`; quick row `rebase-orca-self-test`.
- **Mobile protocol and pairing (P68-15..P68-17):** row `orca-mobile-protocol` derives the protected set from import closures and forbids overlay overlap; full row `orca-mobile-skew` computes tag lag, app lag and the verdict with Orca's own compatibility function; pairing with the stock Android app is a deferred human check.
- **Upstream seams (P68-18, P68-19):** `scripts/export-orca-seam-pr.mjs <seam-id>` prepares patch, issue body, PR body and test command under `.mozbuild/orca-upstream/`; nothing is opened by agents; `seams.json` rows gain `upstream: { class, pr }`.
- **Linux live (P68-20):** full row `orca-packaged-live` over the extracted release tarball under the live lock; the PLAT-02 Linux pass re-runs every full Orca row of 60-67 after the merges.
- **Licence surface (P68-21):** `generate-licensing.mjs` extends `THIRD-PARTY-NOTICES.txt` with the shipped Orca closure; non-SPDX/proprietary entries need an owner ruling; no release before the SDK ruling.
- **Mechanics (P68-22, P68-23):** four lanes (01 artifacts, 02 re-pin, 03 protocol/upstream, 04 licensing), merge order 03, 04, 01, 02; coordinator-only files; no user-facing copy.

### Claude's Discretion
Script internals, the exact stage-line wording, the tracking-issue title format, fixture layout, how `orca-packaged-tree` maps `--target` to the staged root per OS, and whether the hosted Orca jobs cache the pnpm store (only by lockfile hash, never across trust boundaries).

### Deferred Ideas (OUT OF SCOPE)
- The Orca mobile fork, the Android APK release and iOS (next milestone, D-23).
- Any change to `main-review` that would let the bot merge without a review (see P68-12).
- Walking back through intermediate Orca tags when the newest is red (P68-09 takes the newest only).
- The macOS release job itself (`build-macos` in `release.yml`), which waits on the Phase 55 blockers (P68-04).
- Deferred verification (one end-of-milestone pass, 59-CONTEXT D-18): stock Android pairing; opening the upstream issues and PRs and recording URLs; the first live weekly tick and the owner's approving review; the `release.yml` dispatch producing Linux and Windows artifacts; macOS and Windows smoke tests; the owner ruling on any shipped package without an allowed SPDX id.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| OVL-02 | Weekly automated re-pin to the newest Orca tag, `rebase-upstream` shape: re-apply seams, Orca's `typecheck:web` and `typecheck:node` over PB's added files, brand scan; green re-pins by itself, conflict stops for a human | Item 5 (auto-merge vs ruleset), item 4 (`--orcad-only`), tag-shape facts from the live remote, pin-move ordering pitfall, `tsc --listFilesOnly` proven on TS 7.0.2, token-split security pattern |
| OVL-03 | Mobile protocol unmodified; stock app pairs; report pin lag | Item 6: protected set derived (1779 files), root-2 narrowing, `evaluateCompat` (not `evaluateRuntimeCompat`) and its four inputs |
| OVL-06 | Terminal provider, browser provider, extra web entry offered upstream as PRs | PR template has 14 headings (derive them); issue-first rule; Phase 63 switch name carries "PB"; upstream tests cannot live in `orca-overlay/files/` |
| PLAT-01 | Three-OS artifacts carry orcad and the overlaid client, node-pty per target on its own runner, Flatpak `--filesystem=home`, one row per check | Items 1 and 2; arch-named file sets; prebuild manifest as runner-provenance evidence; `@` in names vs the sign-windows zip filter; `/src/` grep defect; Windows staged-Node path defect |
| PLAT-02 | Live checks pass on Linux; macOS and Windows smoke when a host exists | `orca-packaged-live` design; PLAT-02 pass ordering after 62-67; deferred smoke rows |
</phase_requirements>

## Summary

Phase 68 is mostly wiring of parts that already exist: `windows-sidecar` plus `check-win-sidecar.sh` is the hosted-native-build template, `rebase-upstream.yml` plus `bump-pr-node` is the re-pin template, `sweep-clock`'s `theiaDue` is the calendar tick, and `theiaClosure()` in `generate-licensing.mjs` is the notice generator. Phase 62 is merged, and it already did one thing P68-01 assigns to Phase 68: `OrcaService` prefers `<appDir>/orca` when `out/orcad/orcad.js` exists there and the pref is not user-set (`powerbrowser/shell/OrcaService.sys.mjs:135-142`).

**Answers to the seven open items (detail below):**

1. **`build-orca.sh` on `windows-latest`:** not as written. The script itself is Git-Bash-compatible (the `windows-sidecar` job already relies on GNU `find`/`sort`/`xargs -d` in Git Bash, `release.yml:327`), and Orca's own CI runs the same `pnpm install --frozen-lockfile --ignore-scripts` then `pnpm build:orcad` on `windows-2022` (`orca/.github/actions/install-node-dependencies/action.yml:230`, `orca/.github/workflows/node-server-tests.yml:155,227`). Two lines stop it: the shell-entry check requires `objdump` (`scripts/build-orca.sh:134`), which Orca only uses on Linux (`orca/config/scripts/build-orcad-prebuilds.mjs:225`, inside `linuxSlotRecord`, called only when `process.platform === 'linux'`), and the final `. generated/upstream-pins.env` (`build-orca.sh:199`) plus `fetch-orca.sh:202-207` need the generator's fragment, while `generate.mjs` needs inkscape. Smallest change: require `objdump` only when `node -p process.platform` is `linux`, and have the hosted job write the fragment with the generator's own exported `emitUpstreamPins` (runs without inkscape, checked this session). Add `git config --global core.longpaths true` and `core.autocrlf false` before the Orca clone, and a corepack `>= 0.34.5` gate (`orca/.github/CONTRIBUTING.md:30-33`).
2. **macOS now:** two hosted thin-tree jobs (`macos-15` arm64, `macos-15-intel` x64, the labels Orca's CI uses), each a separate job (not a matrix, because matrix job outputs overwrite each other and the digest must leave as a job output), plus one `macos-orca-universal` merge job on `ubuntu-latest` (GNU tools and `llvm-lipo`, as docs/BUILD.md's synthetic-pair test did), running `orca-packaged-tree --target macos` and `package-target-natives --target macos` on the merged tree. Nothing consumes it. No DMG, no `build-macos`. Re-dated in WINDOWS.md: the macOS release artifact with Orca (blocked by Phase 55 BLOCKED items 8 and 9), and the macOS smoke test (D-24).
3. **Licence closure:** yes, the Anthropic agent SDK ships: `CLAUDE_AGENT_SDK_VERSION="0.3.284"` is inside `orca/out/orcad/orcad-server.js` (13 MB bundle; the SDK is not in `ORCAD_EXTERNAL_MODULES`, `orca/config/scripts/orcad-entry-build.mjs:37`). Its `LICENSE.md` reads "© Anthropic PBC. All rights reserved. Use is subject to the Legal Agreements outlined here: https://code.claude.com/docs/en/legal-and-compliance." 184 installed production packages fall outside `allowed_spdx` (`["MIT", "MPL-2.0"]`); full list in Appendix A. Owner ruling required; options in Open Question 1. P68-21's method is wrong in two ways (Amendment A11).
4. **`verify-orca-slotless-start.mjs`:** it cannot run its orcad half alone. `skipReason` SKIPs when no built PowerBrowser exists (`scripts/verify-orca-slotless-start.mjs:118`), and `probeOrcad` always calls `pairWebTab` (`:224`). On the re-pin runner it would print SKIP and exit 0, a vacuous green. It needs a new `--orcad-only` mode, and `rebase-orca.sh` must treat SKIP as red.
5. **Auto-merge vs `main-review`:** `allow_auto_merge` is already `true` (`.github/settings/repo.json:3`) and asserted (`scripts/verify-repo-controls.mjs:1229` plant). `main-review` requires the `verify` check from integration 15368 and one approving review, dismisses stale reviews on push, allows merge/squash/rebase, and has one bypass actor, `OrganizationAdmin` with `bypass_mode: "always"` (`.github/settings/ruleset-main-review.json:14-49`). An `Integration` bypass actor is refused (`scripts/verify-repo-controls.mjs:381-384`). So `gh pr merge --auto --merge` by the App arms a merge that waits for the owner's approval; the owner can also merge directly by admin bypass. No settings edit is needed.
6. **Protected mobile protocol set:** 1779 files at the pin = the transitive relative-import closure from `orca/mobile/src/**` into `orca/src/**` (1759 files; 585 direct roots) plus the 19 non-test files of `src/main/runtime/runtime-rpc/` and `src/main/ipc/mobile.ts`, taken without their own transitive closure. Taking root 2 transitively (as P68-15 says) yields 8301 files (40% of `src/`) and includes Phase 63's planned seam S3 `src/main/providers/local-pty/local-pty-runtime-spawn.ts`, so the pick must be narrowed (Amendment A8). `evaluateRuntimeCompat` exists (`orca/src/shared/protocol-compat.ts:18-51`) but is the runtime client/server check; the stock mobile app uses `evaluateCompat` (`:73-101`, mirrored in `orca/mobile/src/transport/protocol-compat.ts:14-38`), Amendment A9.
7. **Dependencies on 63-67:** the four lanes are executable now (Phase 62 is merged). What waits: the classification and export of the three D-27 seams (63, 64, 66), the Linux PLAT-02 live pass and the container release build (all of 62-67), and the pairing human check (67). Proposed split: wave 1 = lanes 68-01..68-04 now; wave 2 = 68-05 (seam classes and upstream export of real seams) and 68-06 (coordinator: release build, `orca-packaged-live`, PLAT-02 pass, WINDOWS.md) after Phase 67.

**Other findings the planner must act on:**

- **`package-linux.sh`'s checkout-path grep cannot pass in the container.** It greps the stage for `"$ROOT/"` (`powerbrowser/packaging/package-linux.sh:93-95`), and in `release.yml:183` `ROOT` is `/src`. The string `/src/` occurs in `theia/applications/browser/lib/frontend/bundle.js` and in 5 Orca output files (`orca/out/orcad/orcad-server.js`, `out/orcad/out/cli/index.js`, two `out/web/assets/*.js`, node-pty's `package.json`). `package-windows.sh:67-71` documents this exact failure and searches the hosted build root instead. P68-02 extends this grep to `orca/`; it must first be changed to search the host build root (legion's `$GITHUB_WORKSPACE` / `$PWD`, passed into the container). This is a pre-existing defect that has never surfaced because no container package has run on this tree (WINDOWS.md entry 30).
- **The Windows staged Node is not where either service looks.** `package-windows.sh:64` stages `node/node.exe`; `OrcaService.sys.mjs:126` and `TheiaService.sys.mjs:570` look for `<appDir>/node/bin/node`, then fall back to `pathSearch("node")`. A Windows install runs whatever `node` is on PATH, or fails. Pre-existing (Phase 54), affects Orca equally; record it in WINDOWS.md and fix in lane 01 (one platform-aware path in both services) or re-date.
- **The sign-windows zip filter refuses Orca.** `release.yml:669` admits only `^[A-Za-z0-9._/-]+$`; Orca ships `out/orcad/node_modules/@parcel/watcher/{index.js,watcher.node}` and `@linear/sdk/index.js`. Dormant while signing is skipped (R14), but `win-sign-list.mjs` work is pointless unless this regex admits `@`.
- **macOS per-arch staging refuses Orca by name.** `package-macos.sh:337-338` fails on any staged name matching `*linux*`; Orca ships `computer-use-linux/runtime.py` and `computer-use-windows/runtime.ps1` for every target (`orca/src/shared/orcad-artifacts.ts:114-118`). Classify by magic for `orca/` (P68-06 already moves natives to magic).
- **Re-pin ordering.** `orca-pin`, `orcaVersionFromPins()` and `fetch-orca.sh` all read the pin from `configuration.toml` through `generated/upstream-pins.env`. `rebase-orca.sh` must move the two pin lines in the runner's checkout and regenerate (inside `nix develop .#theia`, which has inkscape) before stage 5, or every row compares against the old pin.
- **Tag shapes on the live remote (read 2026-11-09):** 2275 refs; 438 `vN.N.N` tags of which 4 are lightweight (`v1.0.3`, `v1.0.4`, `v1.0.5`, `v1.4.148`, no `^{}` line); also `vN.N.N-rc.N` (648), `-rc.N.perf`, `-rc.N.ghes`, `-rc.N.issueN`, `mobile-android-v*` (34, mostly lightweight), `mobile-v*`, `mobile-ios-v*`. Newest `v1.4.255` (annotated, peeled `084ce0eebbdda3f665251984804f2238be666296`); newest `mobile-android-v0.0.64`. The selector takes the `^{}` sha when present, else the bare sha.

**Primary recommendation:** land wave 1 as four lanes now with the amendments below (portable `build-orca.sh`, host-root checkout grep, separate macOS jobs plus a Linux-side universal merge, narrowed protected set, `evaluateCompat`, bundle-derived licence closure, `--orcad-only`, replay-only token job); hold the D-27 seam export and the PLAT-02 live pass for a wave 2 after Phase 67.

## Context amendments

Each is a change to a locked pick that the tree disproves or forces. Ordered by consequence.

| # | Pick | Amendment | Evidence |
|---|------|-----------|----------|
| A11 | P68-21 | (a) Do not check per-package ids against `allowed_spdx`: that list is the tree-level allow-list (`inventory/licence-allowlist.json:2`, `$comment` "one row per tree"), and Theia's shipped notices already carry ISC (65), BSD-3-Clause (25), Apache-2.0 (22), BlueOak-1.0.0, Unlicense, Python-2.0 and EPL/GPL dual licences (counted in `THIRD-PARTY-NOTICES.txt`). Checking against it reds 184 Orca packages. The per-package gate is: every shipped package gets a notice (the `theiaClosure` pattern), and red only on a non-SPDX or proprietary marker (`SEE LICENSE IN ...`, `UNLICENSED`, `NONE`, no `license` field and no licence file) or an expression with no permissive disjunct. The permissive set is a new owner-ruled key (proposed `allowed_package_spdx`), not `allowed_spdx`. (b) `pnpm list --prod` misses what Vite bundles into `out/web`: `react` and 38 renderer libraries are `devDependencies` in `orca/package.json`. Derive the shipped set from the bundles: an esbuild `metafile` pass that imports Orca's own exported entry config (`ORCAD_ENTRY_POINT`, `ORCAD_LAUNCHER_ENTRY_POINT`, `ORCAD_CHILD_ENTRY_POINTS`, `ORCAD_EXTERNAL_MODULES`, `ORCAD_BUNDLE_PLUGINS`, `orca/config/scripts/orcad-entry-build.mjs:11-71`) with `write: false`, plus `node config/scripts/run-vite-web-build.mjs --sourcemap --outDir <scratch>` (it forwards argv to `vite build`, `run-vite-web-build.mjs:15-16`) for `out/web`, plus the staged `node_modules` of `out/orcad`, plus the mobile prod closure for `out/mobile-web`. | Item 3 run this session |
| A8 | P68-15 | Root 2 contributes its own files only (the 19 non-test files in `src/main/runtime/runtime-rpc/` and `src/main/ipc/mobile.ts`), not their transitive closure. Root 1 stays transitive. Set size at the pin: 1779. A transitive root 2 reaches 8301 files including `src/main/providers/local-pty/local-pty-runtime-spawn.ts`, Phase 63's seam S3 (`63-CONTEXT.md:25`). Use TypeScript's `preProcessFile` from `orca/node_modules/typescript` for import extraction, not a regex. | Closure computed this session |
| A9 | P68-16 | Use `evaluateCompat` (`orca/src/shared/protocol-compat.ts:73-101`) with `mobileProtocolVersion` and `minCompatibleDesktopVersion` from `mobile/src/transport/protocol-version.ts` at the newest `mobile-android-v*` tag, and `desktopProtocolVersion = RUNTIME_PROTOCOL_VERSION`, `desktopMinCompatibleMobileVersion = MIN_COMPATIBLE_RUNTIME_CLIENT_VERSION` from the pin, because that is what orcad reports (`orca/src/main/runtime/orca-runtime-get-status.ts:174-175`) and what the app evaluates (`mobile/src/transport/host-status-gates.ts:58-61`). `evaluateRuntimeCompat` (`:18`) is the CLI/renderer/remote-pairing check. | Read this session |
| A6 | P68-10 | (a) Stage 7 needs a new `--orcad-only` mode (item 4). (b) Before stage 5, move the two pin lines in the runner's `configuration.toml` and run `node scripts/generate.mjs` in `nix develop .#theia`. (c) The brand scan is the tracked-tree scan without `--extra-root orca` (Orca's tree names Orca everywhere). (d) The self-test needs a remote override; follow `fetch-orca.sh`'s pattern (functions taking a remote and target, called by the self-test on a `file://` fixture), never an environment variable the production path reads. | `fetch-orca.sh:23,82-186`; `verify-orca-slotless-start.mjs:114-121,224` |
| A12 | P68-02 | The extended checkout-path grep must search the host build root, not `$ROOT/` in the container. | `package-linux.sh:93-95`; `package-windows.sh:67-71` |
| A2 | P68-03 | `build-orca.sh` needs the two-line change of item 1; the hosted job writes the pins fragment via `emitUpstreamPins`; `release.yml:669` must admit `@`. | Item 1 |
| A3 | P68-04 | Two separate thin jobs, not a matrix; the universal merge runs on `ubuntu-latest` in a new `package-macos.sh orca-universal <arm64-dir> <x64-dir> <out>` mode that `universal` later calls; `build-orca.sh:104` replaces `find -printf` with `find . -type f \| sed 's\|^\./\|\|'`; the job gates `bash` major >= 4 (`mapfile`, `build-orca.sh:72,105`); per-arch name check classifies Orca by magic. | Item 2 |
| A1 | P68-01 | Drop "Phase 68 adds the packaged default": it exists (`OrcaService.sys.mjs:135-142`). Replace with the Windows staged-Node path fix (or its re-dating). | Read this session |
| A4 | P68-06 | "a prebuild manifest slot that is not the target's" has no manifest to read in the shipped tree. The slot record is in `orca/out/orcad-prebuilds/manifest.json` (not shipped): `slots.<slot>.platform`/`arch` are the compiling host's `process.platform`/`process.arch` (`build-orcad-prebuilds.mjs:292-294`) and `files` holds the sha256 of each slot file. The row takes `--prebuild-manifest` and requires: one slot, its platform/arch equal the target, and the staged `node_modules/node-pty/build/Release/*` sha256 set equals that slot's `files`. That proves "built on that target's own runner". | `out/orcad-prebuilds/manifest.json` read this session |
| A5 | P68-09 | The selector accepts lightweight tags (bare sha when no `^{}` line). | Remote read this session |
| A7 | P68-12 | No `repo.json` edit (already true). Record that `OrganizationAdmin` bypass `always` lets the owner merge without the review. | Item 5 |
| A10 | P68-18 | The PR body follows the template's `## ` headings derived at run time (14 at the pin: ELI5, What Changed, Why, Linked Issue, Visual Proof, Testing, Risk, AI Disclosure, Review, Agent skill upstream boundary, Notes, Checklist and the two checklists), not a fixed six. Upstream test files live outside `orca-overlay/files/` (that directory is copied into the build and every source file there must carry a marker that survives into a bundle, `verify-orca-overlay.mjs` P62-20 rule); use `orca-overlay/upstream/<seam-id>/`. The export refuses a patch that contains `PB`, `PowerBrowser` or `powerbrowser` tokens; Phase 63's switch `ORCA_PB_THEIA_PTY_ENDPOINT` (`63-CONTEXT.md:25`) would fail that and needs a generic upstream form. | `orca/.github/pull_request_template.md` |
| A13 | P68-22 | Split into wave 1 (lanes 01-04, now) and wave 2 (68-05 seam export, 68-06 coordinator) after Phase 67; move `verify-orca-slotless-start.mjs` into lane 02 and `build-orca.sh` into lane 01. | Item 7 |

## Project Constraints (from CLAUDE.md)

- Never fork or patch Theia core (`scripts/diff-theia-core.sh`). Not touched.
- Never modify Gecko outside the patch stack; Firefox internals only through `PowerBrowserAPI.sys.mjs`, catalogued in `INTERNAL-APIS.md` (`check-internals-boundary.sh`). A Windows staged-Node fix in `OrcaService`/`TheiaService` must use existing boundary methods (`getAppDir`, `pathExists`); if it needs the OS, a new boundary method plus catalogue row.
- Design for the bridge (`verify-registry-shape.mjs`). Not touched.
- The repo lives at a path with no space. Hosted runners: `D:\a\<repo>\<repo>` and `/Users/runner/work/...` have no space.
- Theia is the default GUI; no custom chrome. Not touched.
- Residual-brand scan is permanent; it iterates `git ls-files`, so stage new files first; tokens are classified only in `inventory/brand-tokens.json`, whose Orca rows carry exact counts (coordinator re-measures once after merges).
- Patches are regenerated, never text-edited (`check-patch-surface.sh`, `apply-patches.sh --self-test`, `regenerate-patches.sh --check`). The re-pin regenerates seam patches with `regenerate-patches.sh --upstream orca --patches orca-overlay/patches`.
- One driver, one registry (`scripts/verify-platform.sh`); never assert on the absence of a log line unless the emitter is the code under test; derive and compare as sets; every check has a `--self-test` that plants faults and requires red naming the drift.
- User-facing copy: no internal identifier in user-visible text. P68-23: none added.
- Builds run in Nix dev shells on legion; hosted Windows/macOS jobs cannot (the flake is `x86_64-linux` only, `flake.nix:11`).
- Global user rules for this session: plain technical English; no org names written into new files; no signing or store publishing; Windows never blocks Linux; human checks and owner actions deferred to the end of the milestone.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Linux Orca build | legion runner, `nix develop .#orca` (`build-linux`) | release container (`package-linux.sh` staging) | Same procedure as dev; container only stages and strips |
| Windows/macOS Orca build | GitHub-hosted runner of that OS (`windows-orca`, `macos-orca-*`) | `ubuntu-latest` (macOS universal merge) | Natives built only on their own OS; admitted by a digest that leaves the job as an output |
| Packaging into `<GreD>/orca` | `package-{linux,windows,macos}.sh` | `check-win-sidecar.sh` (admission, purge) | Existing staging scripts own the app dir |
| Packaged-root resolution at runtime | Chrome `OrcaService.sys.mjs` (exists) | `PowerBrowserAPI.getAppDir` | Phase 62 did it |
| Weekly tick | `release-train.yml` `sweep-clock` + pure `orcaDue` | clock App dispatch | No `schedule:` (D-77) |
| Candidate selection | `detect-orca` job + `detect-upstreams.mjs --orca-select` | `git ls-remote` | Pure selector over a listing file |
| Replay and gates | `rebase-orca.yml` (read-only token) running `rebase-orca.sh` | registry rows by label | Third-party code runs only where no write token exists |
| Publishing the bump | `bump-pr-orca` (bot environment, App token) | `publish-bump-branch.sh`, `gh pr merge --auto` | Replay-only, no Orca code executed with the token present |
| Protocol isolation | `verify-orca-mobile-protocol.mjs` (static) | `orca/node_modules/typescript` `preProcessFile` | Derived from the pinned tree |
| Skew report | `verify-orca-mobile-skew.mjs` (network read) | Orca's `evaluateCompat` via Node type stripping | No copy of the rule |
| Upstream PR preparation | `export-orca-seam-pr.mjs` (writes `.mozbuild/`) | owner opens issue and PR | Agents never push upstream |
| Licence notices | `generate-licensing.mjs` | esbuild metafile, Vite sourcemaps | Derived from what is bundled |

## Standard Stack

No new package is installed. Every tool below is already in the tree, in Orca's lockfile, or preinstalled on the hosted runner image.

### Core (reuse, do not rebuild)
| Asset | Where | Purpose |
|-------|-------|---------|
| `windows-sidecar` job + `check-win-sidecar.sh check|purge` | `release.yml:247-350`; `powerbrowser/packaging/check-win-sidecar.sh` | Hosted native build, `SHA256SUMS` + `BUILD_ROOT`, digest as job output, set-equality admission, build-root purge (generic despite the name) |
| `rebase-upstream.yml` + `rebase-upstream.sh` | `.github/workflows/`, `scripts/` | Replay workflow shape: `workflow_call`, no default tag, `stage` output from the first `FAIL -- ` line, `contents: read`, `persist-credentials: false` |
| `detect-node` / `bump-pr-node` | `release-train.yml:357-637` | Separate detector and bump job per upstream; App token minted in-job; `publish-bump-branch.sh`; `UNEXPECTED` path check (`:518-526`) |
| `theiaDue` | `scripts/release-train.mjs:1790-1797` | Calendar tick shape; `orcaDue` copies it |
| `apply-patches.sh` / `regenerate-patches.sh` | `scripts/` | Both take `--upstream <dir> --patches <dir>`; `--3way` with blob-hash non-vacuity |
| `emitUpstreamPins(config)`, `resolveConfig` | `scripts/generate.mjs:3132-3166` | Writes the pins fragment without inkscape (run this session) |
| `theiaClosure`, `licenseField`, `licenceText` | `scripts/generate-licensing.mjs:127-196` | Notice grouping by licence text; reuse for Orca packages |
| `walk`, `NODE_NAMES` | `scripts/verify-orca-build-shape.mjs:54,87` | Tree walk for `orca-packaged-tree` |
| Orca's `SERVER_TARGETS`, `MATRIX_SLOTS`, `ORCAD_RIPGREP_ARTIFACTS`, `orcadAgentBrowserNativeName`, `orcadNodePtySlotFiles` | `orca/src/shared/node-runtime-pin.ts:4-13`, `config/scripts/build-orcad-prebuilds.mjs:39-48`, `src/shared/orcad-artifacts.ts:75-128`, `src/shared/orcad-agent-browser-name.ts` | Arch-named and per-target file sets, imported by Node type stripping (`orcad-artifacts.ts:1-2` states the file stays erasable-only) |
| `evaluateCompat` | `orca/src/shared/protocol-compat.ts:73-101` | Skew verdict |
| TypeScript 7.0.2 (Orca's) | `orca/node_modules/typescript` | `tsc --listFilesOnly -p config/tsconfig.node.json` works (exit 0, 21591 lines, run this session); `preProcessFile` for import extraction |
| esbuild, Vite 8.3.5 (Orca's) | `orca/node_modules` | Metafile / sourcemap derivation of the shipped package set |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Universal merge on `ubuntu-latest` | `macos-15` with Apple `lipo` | macOS lacks GNU `sha256sum`, `xargs -d`, `chmod --reference` that `check-win-sidecar.sh` and `package-macos.sh:185` use; Linux has them |
| Transitive root 2 for the protected set | Narrow root 2 (own files) | Transitive covers 40% of `src/` and blocks Phase 63's seam S3 |
| `pnpm list --prod` licence closure | Bundle-derived set | `--prod` misses Vite-bundled devDependencies (react); bundle-derived is exact for orcad and web |
| Vite `build.license` (exists in 8.3.5, `node_modules/vite/dist/node/index.d.ts:2938-2941`) | `--sourcemap` CLI | `build.license` has no CLI flag; enabling it needs a config edit (a seam). `--sourcemap --outDir` needs none |
| Matrix job for macOS thin trees | Two named jobs | Matrix job outputs are last-writer-wins; the digest per arch must leave as its own output |

**Installation:** none. **Version verification:** not applicable (no package added).

## Package Legitimacy Audit

Not applicable: this phase installs no external package. Corepack (already pinned in `.#orca` as 0.35.0) and the runner images' Rust, Visual Studio, Xcode and LLVM are toolchains, not dependencies; the corepack minimum is a gate, not an install. Packages named in Appendix A are Orca's own locked dependencies, listed for licensing, not recommended.

**Packages removed due to [SLOP] verdict:** none. **Packages flagged [SUS]:** none.

## Architecture Patterns

### System Architecture Diagram

```
 RELEASE (owner dispatch of release.yml)
   build-linux (legion) ── fetch-orca.sh ─> nix .#orca build-orca.sh ─> orca/out/{orcad,web}
        │                                                         │
        └─ container: package-linux.sh stages <GreD>/{theia,node,orca}, patchelf, host-root grep, precomplete
                └─> rows: portable-elf, sidecar-no-symlinks, package-target-natives (magic), orca-packaged-tree ─> upload

   windows-orca (windows-latest, no secret) ─> pins fragment ─> build-orca.sh (Git Bash) ─> stage orca-out/
        └─ SHA256SUMS + BUILD_ROOT ─> check-win-sidecar check/purge ─> output sums_sha256 ─> artifact
   windows-sidecar (unchanged) ──────────────────────────────────────────────────────────┐
   build-windows (legion) needs [windows-sidecar, windows-orca] ─> package-windows.sh admits both, stages <GreD>/orca
        └─> sign-windows (skipped without Azure; Linux never waits)

   macos-orca-arm64 (macos-15) ─┐                                   (no consumer; DMG waits on Phase 55)
   macos-orca-x64 (macos-15-intel) ─┴─> macos-orca-universal (ubuntu-latest): admit both, orca-universal merge (llvm-lipo),
                                        orca-packaged-tree --target macos, package-target-natives --target macos

 RE-PIN (clock App dispatch of release-train.yml, daily)
   sweep-clock ── orcaDue(now, lastSweep) ──┐   owner input repin-orca ──┐
                                            v                            v
   detect-orca: git ls-remote --tags <fetch-orca REMOTE> ─> detect-upstreams --orca-select ─> candidate tag+commit | hold
        v
   rebase-orca (workflow_call, contents: read): rebase-orca.sh
     move pin (runner copy) + generate ─> fetch ─> seam-apply/regenerate ─> typecheck:web ─> typecheck:node
     ─> typecheck coverage ─> build-orca.sh ─> rows ─> slotless --orcad-only ─> brand scan ─> stage output
        │ green                                              │ red
        v                                                    v
   bump-pr-orca (bot env): replay-only (fetch+apply+regen, no Orca code run)   report: one issue per tag
     ─> stage explicit paths ─> mint App token ─> publish chore/orca-<tag> ─> gh pr merge --auto --merge
        └─> waits for verify + owner approval (main-review)
```

### Recommended Project Structure (new and changed paths)
```
.github/workflows/rebase-orca.yml          # new: replay definition
.github/workflows/release.yml              # + windows-orca, macos-orca-arm64, macos-orca-x64, macos-orca-universal; build-linux steps; build-windows needs; sign zip regex
.github/workflows/release-train.yml        # + sweep-clock orca-due, input repin-orca, detect-orca, rebase-orca call, bump-pr-orca; report learns orca stage
scripts/rebase-orca.sh                     # new
scripts/verify-orca-packaged-tree.mjs      # new (+ --self-test)
scripts/verify-orca-packaged-live.mjs      # new (+ --self-test for pure verdicts)
scripts/verify-orca-mobile-protocol.mjs    # new: orca-mobile-protocol and orca-mobile-skew (+ self-tests)
scripts/export-orca-seam-pr.mjs            # new (+ --self-test)
scripts/lib/orca-shipped-packages.mjs      # new: esbuild-metafile + sourcemap package derivation (lane 04)
orca-overlay/upstream/<seam-id>/           # new (wave 2): upstream-only test files, never copied into builds
```

### Pattern 1: Hosted native build admitted by an out-of-band digest
**What:** `windows-orca` copies `windows-sidecar` (`release.yml:247-350`): refuse non-main/non-dispatch, require 40-hex sha, checkout `persist-credentials: false`, Node from `node-runtime.json` `win32-x64` through `actions/setup-node`, build, stage, write `BUILD_ROOT` and `SHA256SUMS`, run `check-win-sidecar.sh check` and `purge` on its own output, emit `sha256=` as a job output, upload with `include-hidden-files: true`. `build-windows` gains `needs: [windows-sidecar, windows-orca]` and passes `PB_WIN_ORCA_DIR`/`PB_WIN_ORCA_SUMS_SHA256` into the container for `package-windows.sh`.
**Stage contents:** `orca-out/package.json`, `orca-out/out/orcad/**`, `orca-out/out/web/**` (from `orca/package.json`, `orca/out/orcad`, `orca/out/web`), plus `BUILD_ROOT`, `SHA256SUMS`. The node-pty slot evidence `orca/out/orcad-prebuilds/manifest.json` goes into the artifact as a separate top-level file (listed in `SHA256SUMS`, removed at staging like `BUILD_ROOT`), so `orca-packaged-tree` can check provenance in `build-windows` too.
**Windows job steps before `build-orca.sh`:** `git config --global core.longpaths true`; `git config --global core.autocrlf false`; corepack version gate; write `generated/upstream-pins.env`:
```bash
# Source: scripts/generate.mjs:3132 (exported emitter; no inkscape needed)
mkdir -p generated
node --input-type=module -e "import { resolveConfig, emitUpstreamPins } from './scripts/generate.mjs'; import { writeFileSync } from 'node:fs'; const { config } = resolveConfig('./configuration.toml'); writeFileSync('generated/upstream-pins.env', emitUpstreamPins(config, 'release'));"
bash scripts/fetch-orca.sh && bash scripts/build-orca.sh
```
`windows-latest` provides Visual Studio and Rust (Orca's `build:orcad` compiles the CLI launcher with cargo, `orca/config/scripts/orcad-windows-cli-launcher.mjs:15-35`, `windows-rust-executable-build.mjs:93`, and node-pty and the Windows addons with MSVC through `initialize-windows-native-toolchain.mjs`). Orca's own CI adds `rustup target add x86_64-pc-windows-msvc` (`orca/.github/actions/prepare-windows-cli-launcher/action.yml:40`); copy that one step.

### Pattern 2: Replay-only bump job (token never coexists with third-party execution)
`bump-pr` re-runs the replay in the bot job (`release-train.yml:480-507`), which for Gecko executes no upstream code. For Orca, `pnpm install` and `build:*` execute Orca's scripts. So `bump-pr-orca` runs only `rebase-orca.sh --replay-only` (fetch at tag+commit, `apply-patches.sh`, `regenerate-patches.sh`, rewrite `seams.json` blobs, move the two pin lines), stages by explicit path, and mints the App token in the step after (the existing order mints first; put the mint after the replay here). Full gates ran in `rebase-orca` under `contents: read`.

### Pattern 3: Pure calendar tick
```js
// Source: modelled on scripts/release-train.mjs:1790 (theiaDue). ISO week from UTC days.
export function orcaDue(nowMs, lastSweepMs = null) {
    if (typeof lastSweepMs !== 'number' || !Number.isFinite(lastSweepMs)) return true;
    return isoWeekKey(nowMs) !== isoWeekKey(lastSweepMs);
}
```
Fixtures: Monday first sweep, Tuesday after a missed Monday, same-week second sweep, year boundary (ISO week 1 of a year that starts on Thursday), null last sweep.

### Pattern 4: Candidate selection from a listing file
`detect-orca` runs `git ls-remote --tags "$REMOTE"` where `REMOTE` is read from `scripts/fetch-orca.sh:23` (grep of the one `REMOTE=` line; no second literal). `detect-upstreams.mjs --orca-select <listing> <configuration.toml> --open-prs <file>` prints `orca-tag=` and `orca-commit=` or nothing. Rules: name matches `^v[0-9]+\.[0-9]+\.[0-9]+$` exactly; compare as integer triples; strictly newer than `upstreams.orca_tag`; commit = `^{}` line sha if present else bare sha; an open non-cross-repository `chore/orca-*` head holds. The tag and commit are re-checked by regex in every consuming job before use.

### Pattern 5: Typecheck coverage (non-vacuous typecheck)
```bash
# Source: tsc --listFilesOnly works on Orca's TS 7.0.2 (run this session)
node node_modules/typescript/bin/tsc --listFilesOnly -p config/tsconfig.node.json   > "$T/node.files"
node node_modules/typescript/bin/tsc --listFilesOnly -p config/tsconfig.tc.web.json > "$T/web.files"
# every orca-overlay/files source path (realpath under orca/) must appear in at least one list
```
At the pin the overlay has no `files/` (only one seam), so this stage is proven by the self-test until Phase 63 adds files.

### Pattern 6: Protected protocol set
```js
// Source: approach run this session; use TypeScript's own scanner, not regex.
import ts from '<orca>/node_modules/typescript/lib/typescript.js';
const { importedFiles } = ts.preProcessFile(text, true, true); // relative specifiers only
// resolve '.', '.ts', '.tsx', '.js'->'.ts', '/index.ts'; follow edges that land under orca/src/
// root1 = every non-test file under orca/mobile/src (edges into orca/src only), transitive
// root2 = orca/src/main/runtime/runtime-rpc/*.ts (non-test) + orca/src/main/ipc/mobile.ts, NOT expanded
// red: protected ∩ (seams.json paths ∪ orca-overlay/files paths) ≠ ∅, naming each path
```
Verify the TS 7 package exposes `preProcessFile` in the lane (TS 7 is the native compiler; if the JS API is absent, use the regex the research used, which resolved 1779 files with 0 unresolved relative specifiers, and record the limit in the header).

### Anti-Patterns to Avoid
- **A matrix job carrying the digest output:** overwritten by the last leg.
- **`continue-on-error` on the macOS jobs:** hides a red. They have no consumer, so a red job does not block Linux; leave them honest.
- **Running Orca's install/build in a job that holds the App token.**
- **`--extra-root orca` on the brand scan in the re-pin:** Orca's own name is everywhere in its tree.
- **A SKIP counted as a pass inside `rebase-orca.sh`:** every row it calls must PASS; SKIP is a FAIL line there.
- **Writing the pins fragment by hand on hosted runners:** call `emitUpstreamPins`.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Which npm packages are inside a bundle | Import-graph walker | esbuild `metafile` with Orca's exported entry config; Vite `--sourcemap` `sources` | Bundler resolution (conditions, aliases, plugins) cannot be re-implemented faithfully |
| Import extraction for the protocol closure | Regex parser | `ts.preProcessFile` | Comments, template strings, `import type`, re-exports |
| Mobile/desktop compatibility verdict | Copy of the rule | `evaluateCompat` imported from the pinned tree | The rule changes with the pin |
| Pins fragment on runners without inkscape | Hand-written `.env` | `emitUpstreamPins` | Byte-identical to the generator |
| Patch replay and conflict detection | Custom diff logic | `apply-patches.sh` / `regenerate-patches.sh` with `--upstream orca` | Silent-no-op detection already built |
| Hosted artifact admission | New checker | `check-win-sidecar.sh check|purge` | Same trust shape; self-tested |
| Thin Mach-O merge | Byte surgery | `lipo -create` (llvm-lipo) | Standard |

**Key insight:** every decision in this phase has an existing derivation source in Orca's tree or in this repo; the work is pointing checks at them, not restating them.

## Runtime State Inventory

Not a rename or migration phase. Two persistent states are new: the re-pin's tracking issues (`release-train: orca <tag> stopped`, one per candidate tag, created by `report`) and `chore/orca-<tag>` branches on the repository. No stored data, OS registration, secret or build artifact is renamed.

## Common Pitfalls

### Pitfall 1: A green re-pin that proved nothing
**What goes wrong:** stage 7 prints SKIP (no built PowerBrowser on the runner) and exits 0; stage 4 sees no overlay files; `orca-overlay-built` passes vacuously at zero files (62-RESEARCH A6).
**How to avoid:** `--orcad-only` mode; `rebase-orca.sh` turns any `SKIP` line from a called row into `FAIL -- <row> skipped`; the self-test plants a SKIP-ing row and requires red.

### Pitfall 2: The checkout-path grep in the container
**What goes wrong:** `grep -rlF "/src/"` hits Theia and Orca bundles; staging fails on correct output.
**How to avoid:** pass the host root in (`-e PB_HOST_ROOT="$PWD"` at `release.yml:183`) and grep for that; the Windows script's comment at `package-windows.sh:67-71` is the precedent.

### Pitfall 3: Node 24's bundled corepack
**What goes wrong:** Orca needs corepack >= 0.34.5 to start pnpm 12 (`orca/.github/CONTRIBUTING.md:30-31`); `setup-node`'s Node 24.19.0 may bundle an older corepack [ASSUMED]. `build-orca.sh` already writes shims with `--install-directory` (`:155`), which avoids the Windows `EPERM` that CONTRIBUTING.md describes for shims next to `node.exe`.
**How to avoid:** a gate step comparing `corepack --version` with 0.34.5; on failure, the job installs `corepack@0.35.0` (the `.#orca` version) with `npm install --prefix "$RUNNER_TEMP/corepack"` and prepends it to PATH.

### Pitfall 4: Long paths and line endings on Windows
**What goes wrong:** the Orca clone has deep paths; `D:\a\powerbrowser\powerbrowser\orca\` is longer than Orca's own CI root. Git for Windows defaults `core.autocrlf=true`, so the overlay applies against CRLF worktree files.
**How to avoid:** `core.longpaths true` and `core.autocrlf false` before `fetch-orca.sh`.

### Pitfall 5: The macOS universal merge's byte-identity rule
**What goes wrong:** names that carry the architecture (`agent-browser-darwin-arm64` vs `agent-browser-darwin-x64`, `ripgrep/darwin-arm64/rg` vs `ripgrep/darwin-x64/rg`) appear in one tree only; a JS bundle that differs between the two builds also fails.
**How to avoid:** derive the pair map from `ORCAD_RIPGREP_ARTIFACTS` and `orcadAgentBrowserNativeName('darwin', arch)`; `lipo -create` each pair and stage the fat file under both names (the `better-sqlite3` precedent, `package-macos.sh:175,191-192`); same-name natives (`pty.node`, `spawn-helper`, `watcher.node`) merge in place; every other file must be byte-identical, and a difference is red naming the file. Whether the two runners produce identical JS bundles is not known [ASSUMED]; the first hosted run answers it.

### Pitfall 6: Orca's macOS/Windows natives are not all `.node`
**What goes wrong:** the name-based universe of `package-target-natives` misses `spawn-helper`, `OpenConsole.exe`, `conpty.dll`, `winpty-agent.exe`, `bin/orca.exe`, `agent-browser-*`, `rg.exe` (`orcad-artifacts.ts:75-89`).
**How to avoid:** P68-06's magic universe (ELF `7f454c46`, PE `4d5a`, Mach-O `feedfacf`/`cffaedfe`/`cafebabe`/`feedface`/`cefaedfe`). On Linux today the Orca natives are exactly `agent-browser-linux-x64`, `node_modules/@parcel/watcher/watcher.node`, `node_modules/node-pty/build/Release/pty.node`, `ripgrep/linux-x64/rg` (magic scan this session).

### Pitfall 7: `pty.node` carries a Nix RUNPATH
**What goes wrong:** the legion build links `pty.node` with RUNPATH `/nix/store/...-glibc-2.42-67/lib:/nix/store/...-gcc-15.3.0-lib/lib` (readelf this session); `portable-elf` reds.
**How to avoid:** extend the `patchelf --remove-rpath` loop at `package-linux.sh:83-85` to `$STAGE/orca`. Its GLIBC need is 2.28 (floor 2.28, `powerbrowser/packaging/portability-floor.json`); GLIBCXX need is 3.4.22, bounded by the unmeasured `sysroot-glibcxx` line (`toolchain-baseline.txt:21`).

### Pitfall 8: Brand counts and new files
New files naming Orca (`rebase-orca.*`, `verify-orca-*.mjs`, `export-orca-seam-pr.mjs`) change exact counts in `inventory/brand-tokens.json`; stage before scanning; the coordinator re-measures once. The licence row's `reason` names the pin value (`inventory/licence-allowlist.json:14`); rewrite it to name the manifest key so a re-pin does not leave stale text and the bump's explicit-path set stays as P68-11 lists.

### Pitfall 9: Flatpak scope of `--filesystem=home`
`--filesystem=home` exposes files under HOME, not host binaries in `/usr/bin`; agent CLIs installed system-wide are not visible inside the sandbox, and running host tools needs `flatpak-spawn --host` (`--talk-name=org.freedesktop.Flatpak`), which P68-07 does not grant [ASSUMED]. PLAT-01 asks only for `--filesystem=home`; record the limit in `docs/BUILD.md`.

### Pitfall 10: The re-pin's memory and time on `ubuntu-latest`
Orca's typecheck runner admits `config/tsconfig.node.json` at 7 GiB heap and `tc.web` at 6 GiB (`orca/config/scripts/run-typecheck-projects-in-parallel.mjs:14-15`); run `typecheck:node` and `typecheck:web` sequentially. Set `timeout-minutes: 90` (cold pnpm install of two workspaces, node-pty prebuild compile, build:web).

## Code Examples

### orca-packaged-tree core comparison
```js
// Source: pattern of verify-orca-build-shape.mjs walk + set equality (CLAUDE.md rule 2)
const expected = new Set(['package.json', ...rel(walkFiles('orca/out/orcad'), 'out/orcad/'), ...rel(walkFiles('orca/out/web'), 'out/web/')]);
const staged = new Set(walkFiles(stagedOrcaRoot));
// extra -> "staged but not built: <p>"; missing -> "built but not staged: <p>"
// plus: any NODE_NAMES file, any slot marker (names from orcad-artifacts.ts), any electron binary,
// node-pty slot sha set == manifest.slots[<target slot>].files, slot platform/arch == target
```

### orca-mobile-skew verdict
```js
// Source: orca/src/shared/protocol-compat.ts:73 (imported, Node 24 strips types)
const { evaluateCompat } = await import(pathToFileURL(join(orca, 'src/shared/protocol-compat.ts')));
const verdict = evaluateCompat({
  mobileProtocolVersion: app.MOBILE_PROTOCOL_VERSION,          // at mobile-android-v<newest>
  minCompatibleDesktopVersion: app.MIN_COMPATIBLE_DESKTOP_VERSION,
  desktopProtocolVersion: pin.RUNTIME_PROTOCOL_VERSION,         // 3 at v1.4.248
  desktopMinCompatibleMobileVersion: pin.MIN_COMPATIBLE_RUNTIME_CLIENT_VERSION, // 2 at v1.4.248
});
// app constants: partial clone, one blob: git clone --filter=blob:none --no-checkout --depth 1
//   --branch mobile-android-v<x> <REMOTE> <tmp>; git -C <tmp> show HEAD:mobile/src/transport/protocol-version.ts
```
At v1.4.248, `src/shared/protocol-version.ts:41-43` reads `export const RUNTIME_PROTOCOL_VERSION = 3`, `export const MIN_COMPATIBLE_RUNTIME_CLIENT_VERSION = 2`, `export const MIN_COMPATIBLE_RUNTIME_SERVER_VERSION = 2`; `mobile/src/transport/protocol-version.ts:4-5` reads `export const MOBILE_PROTOCOL_VERSION = 3`, `export const MIN_COMPATIBLE_DESKTOP_VERSION = 2` [VERIFIED: Read this session]. The pinned app version is `"version": "0.0.62"` (`mobile/app.json:5`).

### Flatpak allow-list edit
`scripts/verify-flathub-manifest.mjs:72` today: `const SANDBOX_ALLOW = ['--share=ipc', '--socket=fallback-x11', '--socket=wayland', '--socket=pulseaudio', '--share=network', '--device=dri'];` [VERIFIED: Read this session]. Append `'--filesystem=home'`; the set equality at `:160-164` and the `--filesystem=host` plant at `:383-384` stay.

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `workflow_dispatch` max 10 inputs | max 25 | GitHub changelog 2025-12-04 [CITED: github.blog changelog] | `repin-orca` makes 10 inputs on `release-train.yml`; no limit issue |
| Vite license output via plugin | built-in `build.license` | Vite 7/8 (present in 8.3.5 typings) | Usable only through config; this phase uses `--sourcemap` instead |
| node-pty slots merged across runners (`merge-orcad-prebuilds.mjs`) | PB builds only the host slot | P68-05 | No cross-runner merge script runs |

**Deprecated/outdated in this repo:** the name-based native universe in `verify-package-target-natives.mjs:3-8` (replaced by magic); `package-macos.sh`'s name-based non-darwin check for anything under `orca/`.

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | Git Bash on `windows-latest` provides GNU `find`, `sort`, `sed`, process substitution and bash 5 under `shell: bash` (precedent `release.yml:327`, never run live) | Item 1 | `windows-orca` fails at a shell step; fix is per-command |
| A2 | `windows-latest` carries Visual Studio with the Windows SDK and rustup stable msvc | Pattern 1 | Orca's launcher or node-pty compile fails; add the toolchain step Orca's CI uses |
| A3 | Node 24.19.0's bundled corepack is older than 0.34.5 or of unknown version | Pitfall 3 | Gate step is cheap either way |
| A4 | `core.longpaths` and `core.autocrlf false` are needed and sufficient on the Windows runner | Pitfall 4 | Clone or overlay apply fails; diagnosable from the stage line |
| A5 | `bash` on `macos-15` runners is bash >= 4 (Homebrew) | A3 amendment | `mapfile` fails; the gate step names it |
| A6 | orcad and web bundles are byte-identical between the arm64 and x64 macOS builds | Pitfall 5 | Universal merge reds naming the file; then split those files per arch under `Contents/Resources/orca` is not possible, and the merge needs a per-arch subtree decision (owner) |
| A7 | `llvm-lipo` is on `ubuntu-latest` (LLVM toolchains preinstalled) or installable with apt | Item 2 | One `apt-get install -y llvm` step, as `sign-windows` already installs packages |
| A8 | The release sysroot's GLIBCXX ceiling is at least 3.4.22 | Pitfall 7 | `portable-elf` reds on `pty.node`; build node-pty in the container instead |
| A9 | `ubuntu-latest` for this public repository has about 16 GB RAM | Pitfall 10 | Typecheck OOM; use a larger runner or a legion job (not allowed: legion holds no third-party replay) |
| A10 | Inside the Flatpak sandbox, agent CLIs outside HOME are unreachable | Pitfall 9 | Documentation only |
| A11 | Vite `--sourcemap --outDir <scratch>` through `run-vite-web-build.mjs` writes maps whose `sources` name `node_modules/.pnpm/<pkg>@<ver>/...`, and the mobile prod closure is a superset of what `out/mobile-web` bundles | A11 | Licence closure misses or overcounts packages; overcount is harmless, a miss is caught only by review |
| A12 | Redistributing `@anthropic-ai/claude-agent-sdk` inside `orcad-server.js` requires terms the owner has not accepted | Open Q1 | Legal exposure; the ruling is an owner action |
| A13 | `package-linux.sh` fails in the container today on the `/src/` grep (inferred from the grep and `/src/` hits; the container package has not run on this tree) | Summary | If wrong, A12 is still the correct form for Orca files, which do contain `/src/` |
| A14 | TypeScript 7.0.2's JS entry exposes `preProcessFile` | Pattern 6 | Fall back to the regex with its limit stated |

## Open Questions

1. **The agent SDK (owner ruling).** Facts: bundled into `orca/out/orcad/orcad-server.js`; loaded lazily through `import('@anthropic-ai/claude-agent-sdk')` (`orca/src/main/claude/claude-stream-json-connection.ts:38`); every other reference is `import type`. Options:
   - (a) Ship it under Anthropic's terms, with a notice entry carrying its `LICENSE.md` text; requires the owner's reading of the linked legal agreements.
   - (b) Exclude it from PB's orcad: add it to the esbuild externals (a seam in `orca/config/scripts/orcad-entry-build.mjs:37`, a build script, not shipped code), so structured Claude sessions in orcad fail at that dynamic import with a named error while the rest of orcad runs. Costs one seam of the cap and a feature.
   - (c) Exclude it and resolve it at runtime from a user-installed copy (the Claude Code extension precedent, licence-allowlist `$comment`); needs a resolution path orcad does not have; more seams.
   - (d) Hold Orca out of release artifacts until (a), (b) or (c) is chosen (P68-21's "no release before that ruling").
   Recommendation: (d) as the default state of the release jobs (Orca staged only when the ruling key is present in `inventory/licence-allowlist.json`), with (a) or (b) chosen in the end pass.
2. **Per-package permissive set (owner ruling).** Proposed `allowed_package_spdx`: MIT, ISC, BSD-2-Clause, BSD-3-Clause, Apache-2.0, 0BSD, BlueOak-1.0.0, Unlicense, CC0-1.0, Python-2.0, MPL-2.0, CC-BY-4.0 (data: `caniuse-lite`). Five packages have no `license` field (`ssh2`, `cpu-features`, `buildcheck`, `exit`, `khroma`); the first three carry a LICENSE file beginning "Copyright Brian White. All rights reserved." followed by MIT-form text (read this session); each needs a named exception row.
3. **Phase 63's switch name.** `ORCA_PB_THEIA_PTY_ENDPOINT` names PB. Either Phase 63 picks a generic name now (cheap) or the upstream PR carries a different generic hook than the overlay seam (costly: two implementations).
4. **macOS bundle identity across arches (A6).** Only a hosted run answers it.
5. **Where the macOS jobs live.** In `release.yml` they run on every dispatch, cost hosted minutes and can mark the Release run failed while Linux publishes; the train stage logic reads `channel-live`, not the run conclusion (`scripts/release-train.mjs:977-990`), so Linux is unaffected. A separate dispatch-only workflow avoids the red mark but adds a workflow file. Recommendation: `release.yml`, as P68-04 says.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Built `orca/` at 965978bc | rows, closures, natives scan | yes | `out/orcad` 57 MB, `out/web` 73 MB, 1589 files | `nix develop .#orca --command bash scripts/build-orca.sh` |
| pnpm 12.14.0 (corepack shim) | licence closure reads | yes | `.mozbuild/corepack/bin/pnpm` | build-orca.sh step 5 |
| Orca TypeScript | coverage, `preProcessFile` | yes | 7.0.2; `--listFilesOnly` works | none |
| readelf / objdump | natives inspection | yes | binutils 2.46 (Nix) | none |
| Host Node | verify scripts | yes | 24.22.1 (type stripping on) | `.#orca` Node 24.19.0 |
| Network read to the Orca remote | detect, skew | yes | `git ls-remote` succeeded | fixture listings for self-tests |
| Built PowerBrowser and a container release tarball | `orca-packaged-live`, packaged rows | no (stale objdir; no container tarball, WINDOWS.md 30) | — | coordinator builds in wave 2 |
| Windows or macOS host | smoke tests | no | — | deferred (D-24, CF-10) |
| Android device | pairing | no | — | deferred (P68-17) |
| GitHub-hosted runners | windows/macos jobs, re-pin | not exercised (no push yet) | — | first run after Chris pushes `main` |

**Missing with no fallback in this phase:** none blocking wave 1. Wave 2 needs the container build and a built PowerBrowser.

## Validation Architecture

(`workflow.nyquist_validation` is `true`.) All rows are registry rows in `scripts/verify-platform.sh`; each new check has a quick `-self-test` row that plants faults and requires red naming the drift. Human checks are only the D-18 deferred items.

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Node 24 / bash scripts under the `verify-platform.sh` registry; no unit framework |
| Config file | none (registry rows) |
| Quick run command | `scripts/verify-platform.sh --quick` or `--only <label>` |
| Full suite command | `scripts/verify-platform.sh` (live rows under `flock /home/chris/coding/Power-Browser/.git/pb-live.lock`) |

### Phase Requirements -> Test Map
| Req | Behavior | Row(s) | Tier | Self-test plants (each red, naming it) | Exists? |
|-----|----------|--------|------|------------------------------------------|---------|
| PLAT-01 | staged `<GreD>/orca` equals built `package.json` + `out/orcad` + `out/web`; no Node executable, slot marker, Electron; node-pty slot sha set and platform/arch equal the target per the prebuild manifest | `orca-packaged-tree` (`--target linux-x64\|win64\|macos`, `--stage`, `--prebuild-manifest`), `orca-packaged-tree-self-test` | full / quick | missing file, extra file, `node`/`node.exe`, `.server-target`, Electron ELF, slot from another platform, slot sha mismatch, empty stage ("vacuous") | new |
| PLAT-01 | every ELF/PE/Mach-O in the stage is the target arch | `package-target-natives`, `-self-test` (edited) | full / quick | wrong-arch Mach-O under `orca/`, unnamed executable (`spawn-helper`-shaped), PE32 (not +) under `orca/` | edit |
| PLAT-01 | no Nix interpreter/RUNPATH, GLIBC <= 2.28 incl. Orca | `portable-elf` (unchanged universe covers `orca/`) | full | existing | yes |
| PLAT-01 | no symlink in the tarball incl. `orca/` | `sidecar-no-symlinks` | full | existing | yes |
| PLAT-01 | Flatpak grants exactly the allow-list incl. `--filesystem=home` | `flathub-manifest`, `-self-test` (edited) | quick | remove `--filesystem=home`; existing `--filesystem=host` plant stays | edit |
| PLAT-01 | release.yml carries `windows-orca`, two macOS thin jobs and the universal job with the hosted trust shape; no Linux job needs them; `orca-packaged-tree` among build-linux's packaged labels | `release-shape`, `-self-test`; `build-windows-shape`, `-self-test`; `workflows` | quick | Linux job `needs: windows-orca`; `windows-orca` with a secret or environment; digest read from `vars.`; matrix for macOS thin jobs; packaged step drops `orca-packaged-tree` | edit |
| PLAT-01 | Windows artifact admission | `win-sidecar-check-self-test` (unchanged script, reused) | quick | existing | yes |
| PLAT-01 | sign list learns Orca PE set from admitted SUMS | `win-sign-list-self-test` (edited) | quick | Orca PE not in SUMS; SUMS PE absent from zip; `@` name refused by the old regex | edit |
| PLAT-01 | macOS universal merge plan derived from Orca's arch tables | `orca-macos-merge-self-test` (pure Node: pair map, dual-name staging, identity-required files) | quick | arch-named file without a pair, differing non-native file, table yields zero pairs ("source moved") | new |
| PLAT-01 | build-orca.sh portability | `build-orca-portable-self-test` (static: objdump guarded by platform, no `-printf`, pins fragment path) | quick | unguarded `objdump`, `find -printf`, sourcing a missing fragment | new |
| PLAT-01 (licence) | notices cover the shipped Orca closure; proprietary/non-SPDX entries need a named ruling | `licensing` (`--check`), `licensing-self-test` (edited); `licence-allowlist`, `-self-test` (edited for `allowed_package_spdx` and exception rows) | quick (closure step SKIPs by a line without built `orca/`) | `SEE LICENSE IN` package with no ruling row; package with no field and no file; GPL-only expression; package present in metafile but missing from notices | edit |
| OVL-02 | weekly tick | `release-train-logic-self-test` (edited, `orcaDue` fixtures) | quick | Monday, missed Monday, same week, ISO year boundary, null | edit |
| OVL-02 | candidate selection | `detect-upstreams-self-test` (edited, `--orca-select`) | quick | `-rc.N`, `.perf`, `mobile-android-v*`, lightweight tag, not newer, equal, open `chore/orca-*` hold, `v1.4.9` vs `v1.4.10` ordering | edit |
| OVL-02 | replay stops at the named stage; typecheck non-vacuous | `rebase-orca-self-test` | quick | seam conflict -> `seam-apply <patch>`; type error -> `typecheck:web <file>:<line>`; overlay file outside program -> `typecheck coverage`; brand token; changed LICENSE; a called row prints SKIP -> red; control green first | new |
| OVL-02 | `rebase-orca.yml` carries no tag, commit or `schedule:` | `verify-upstream-pins`, `-self-test` (edited) | quick | default tag, literal commit, `schedule:` | edit |
| OVL-02 | orcad half of the start probe | `orca-slotless-start --orcad-only` (called by `rebase-orca.sh`), `orca-slotless-start-self-test` (edited) | full / quick | `--orcad-only` still opening a browser; SKIP when PB absent in `--orcad-only` | edit |
| OVL-02 | bump commits only explicit paths; auto-merge armed; red opens one issue | `workflows` + `release-shape`-style text checks inside `verify-workflows.mjs` or a new rule block | quick | bump stages a workflow file; mint before replay; `gh pr merge` without `--auto` | edit |
| OVL-03 | overlay touches no protected path | `orca-mobile-protocol`, `-self-test` | quick (SKIP by a line without `orca/`) | seam on `src/shared/protocol-version.ts`; overlay file shadowing a closure file; closure size 0 ("source moved") | new |
| OVL-03 | lag and verdict | `orca-mobile-skew` (network), `-self-test` | full / quick | `blocked` verdict fixture, `mobile-too-old`, `desktop-too-old`, tag listing with no app tag, constants file moved | new |
| OVL-03 | stock app pairs | human, deferred (D-18) | — | — | — |
| OVL-06 | every seam row has `upstream.class`; `pr` null or a PR URL on Orca's repo derived from `fetch-orca.sh` REMOTE | `orca-overlay`, `-self-test` (edited) | quick | missing key, unknown class, URL on another repo, non-PR URL | edit |
| OVL-06 | export writes patch, issue body, PR body with the template's derived headings, test command; refuses PB tokens | `orca-seam-export-self-test` | quick | template heading missing from body, `PowerBrowser` in patch, patch not applying to fixture main | new |
| OVL-06 | the three D-27 classes each have a PR URL | `orca-upstream-prs` | full; red until the owner records URLs; `GATE_KNOWN_OPEN_EXCLUSIONS` entry tied to a WINDOWS.md id | — | new (wave 2) |
| PLAT-02 | packaged orcad ready from `<GreD>/orca`, `/proc/<pid>/exe` = `<GreD>/node/bin/node`, web tab pairs, reaped on quit | `orca-packaged-live`, `-self-test` (pure verdicts) | full / quick | exe from another Node, root not under GreD, survivor after quit, paired=false | new |
| PLAT-02 | Linux pass over all full Orca rows of 60-67 | the existing full rows (`orca-build-shape`, `orca-slotless-start`, `orca-overlay-built`, `orca-service-live`, `orca-hidden-electron`, and 63-67's) | full | — | wave 2 |
| PLAT-02 | macOS/Windows smoke | human, deferred | — | — | — |

### Sampling Rate
- **Per task commit:** `scripts/verify-platform.sh --only <the lane's quick rows>` plus `node scripts/scan-brand-residue.mjs` after staging.
- **Per wave merge:** `scripts/verify-platform.sh --quick`.
- **Phase gate:** `--quick` green; wave 2 adds the container release build, `--only orca-packaged-tree`, `portable-elf`, `package-target-natives`, `sidecar-no-symlinks`, `orca-packaged-live` and every full Orca row under the live lock.

### Wave 0 Gaps
- [ ] `scripts/verify-orca-packaged-tree.mjs`, `verify-orca-packaged-live.mjs`, `verify-orca-mobile-protocol.mjs`, `export-orca-seam-pr.mjs`, `rebase-orca.sh` (each with `--self-test`, exit 2 on an unknown argument with a `Next step:` line).
- [ ] Fixture Orca repository builder shared by `rebase-orca-self-test` (two `v` tags, a `package.json` whose `typecheck:*` scripts are Node checkers).
- [ ] Rows appended in each lane's commented block; coordinator resolves `scripts/verify-platform.sh`.
- [ ] Brand rows re-measured once after merges (coordinator).

## Security Domain

(`security_enforcement` absent: enabled.)

### Applicable ASVS Categories
| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | no | — |
| V3 Session Management | no | — |
| V4 Access Control | yes | `contents: read` for every job that runs Orca code; App token only in `bump-pr-orca`, minted after the replay; no App bypass on `main-review` (`verify-repo-controls.mjs:381-384`) |
| V5 Input Validation | yes | tag `^v[0-9]+\.[0-9]+\.[0-9]+$` and commit `^[0-9a-f]{40}$` re-checked in every consuming job; `overlay_path_ok` (`build-orca.sh:62-65`) |
| V6 Cryptography | no | sha256 digests only, existing tools |
| V10 Malicious Code | yes | hosted native builds admitted by an out-of-band digest; lifecycle scripts off (`--ignore-scripts`) |
| V14 Configuration | yes | no `schedule:`; SHA-pinned actions (`workflows` row) |

### Known Threat Patterns
| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Third-party build steals a write token | Elevation | Orca code runs only in `contents: read` jobs; bump job replays without executing Orca; token minted after replay |
| Forged hosted artifact | Tampering | digest as job output, `check-win-sidecar.sh` set equality, purge of build root |
| Tag injection into shell | Tampering | strict regex before use; tag passed as env, never interpolated into `run:` text |
| Bot self-merge | Elevation | `main-review` one approval, stale dismissal, no Integration bypass |
| Upstream moves a tag | Tampering | pin is tag plus peeled commit; `fetch-orca.sh` refuses a mismatch (`:41-48`) |
| Shipping proprietary code without terms | Repudiation (legal) | licence gate reds on non-SPDX markers; owner ruling row |

## Sources

### Primary (HIGH confidence; read or run this session)
- This repo: `CLAUDE.md`; `.planning/workstreams/orca/{ROADMAP.md,REQUIREMENTS.md,DECISIONS.md}`; `68-CONTEXT.md`; `62-RESEARCH.md`; `63-CONTEXT.md`; `.github/workflows/{release.yml,release-train.yml,rebase-upstream.yml}`; `.github/settings/{repo.json,ruleset-main-review.json,app-powerbrowser-bot.json,environment-bot.json}`; `scripts/{build-orca.sh,fetch-orca.sh,rebase-upstream.sh,apply-patches.sh,regenerate-patches.sh,verify-orca-slotless-start.mjs,verify-orca-overlay.mjs,verify-orca-build-shape.mjs,verify-package-target-natives.mjs,verify-portable-elf.mjs,verify-flathub-manifest.mjs,verify-repo-controls.mjs,verify-release-shape.mjs,verify-build-windows-shape.mjs,verify-workflows.mjs,verify-licence-allowlist.mjs,generate-licensing.mjs,generate.mjs,release-train.mjs,detect-upstreams.mjs,verify-upstream-pins.mjs}`; `powerbrowser/packaging/{package-linux.sh,package-windows.sh,package-macos.sh,check-win-sidecar.sh,node-runtime.json,portability-floor.json}`; `powerbrowser/shell/{OrcaService.sys.mjs,TheiaService.sys.mjs,powerbrowser-sidecar.js}`; `flatpak/org.debios.PowerBrowser.json`; `inventory/licence-allowlist.json`; `THIRD-PARTY-NOTICES.txt`; `.planning/WINDOWS.md`; `.planning/workstreams/deploy/phases/55-macos-i/BLOCKED.md`; `docs/BUILD.md:1376-1378`; `flake.nix`; `configuration.toml:155-166`; `orca-overlay/`.
- Orca at the pin (`orca/`, 965978bc): `package.json`; `config/scripts/{build-orcad-node.mjs,build-orcad-prebuilds.mjs,build-orcad.mjs,orcad-entry-build.mjs,ensure-native-runtime.mjs,initialize-windows-native-toolchain.mjs,orcad-windows-cli-launcher.mjs,orcad-windows-security.mjs,orcad-prebuild-node-gyp.mjs,build-windows-cli-launcher.mjs,run-vite-web-build.mjs,run-typecheck-projects-in-parallel.mjs}`; `src/shared/{orcad-artifacts.ts,orcad-agent-browser-name.ts,node-runtime-pin.ts,protocol-version.ts,protocol-compat.ts}`; `src/main/runtime/orca-runtime-get-status.ts`; `src/main/claude/*`; `mobile/src/transport/{protocol-version.ts,protocol-compat.ts,host-status-gates.ts}`; `mobile/app.json`; `.github/{pull_request_template.md,CONTRIBUTING.md}`; `.github/actions/{prepare-orcad-prebuilds,prepare-windows-cli-launcher,install-node-dependencies,setup-pnpm}/action.yml`; `.github/workflows/node-server-tests.yml`; `AGENTS.md`; `out/orcad-prebuilds/manifest.json`; `node_modules/@anthropic-ai/claude-agent-sdk/{package.json,LICENSE.md,README.md}`; `node_modules/vite/dist/node/index.d.ts`.
- Runs this session: magic scan of `orca/out`; `readelf -d/-V` on the four Linux natives; grep of outputs for checkout path, `/nix/store`, `/src/`, the SDK version string; import closures (mobile 1759, rpc transitive 8301, protected 1779); `pnpm list --prod/--dev --json --depth Infinity` in `orca/` and `orca/mobile/` (1156 prod packages, 54 not installed on this host); `tsc --listFilesOnly` on TS 7.0.2; `emitUpstreamPins` without inkscape; `git ls-remote --tags` of the Orca remote (read only).

### Secondary (MEDIUM)
- [GitHub changelog 2025-12-04: workflow_dispatch supports 25 inputs](https://github.blog/changelog/2025-12-04-actions-workflow-dispatch-workflows-now-support-25-inputs/)
- [Manually running a workflow (GitHub docs)](https://docs.github.com/en/actions/how-tos/manage-workflow-runs/manually-run-a-workflow)

### Tertiary (LOW)
- Hosted runner image contents (Visual Studio, Rust, Homebrew bash, LLVM): training knowledge, logged as A2, A5, A7.

## Metadata

**Confidence breakdown:**
- Standard stack and reuse map: HIGH (every asset opened).
- Item answers 1-7: HIGH for the tree facts; MEDIUM for hosted-runner behaviour (never run).
- Licence closure: HIGH that the SDK ships and on the counts; MEDIUM on the exact shipped set until the bundle-derived method runs.
- Pitfalls: HIGH (each from a file or a run), except A6/A8/A9.

**Research date:** 2026-11-09
**Valid until:** 2026-11-23 (the Orca remote publishes several tags a week; re-read tag counts and the newest app tag at planning time)

## Appendix A: Installed production packages outside `allowed_spdx` (`["MIT", "MPL-2.0"]`)

Source: `pnpm list --prod --json --depth Infinity` in `orca/` ([root]) and `orca/mobile/` ([mobile]) at 965978bc, licence read from each installed `package.json`; 184 packages. 54 optional platform packages for other hosts are not installed here and are not listed. This is a superset for `[mobile]` (it includes build tools the Expo closure carries) and an undercount for `out/web` (Vite-bundled devDependencies are not in `--prod`); Amendment A11 replaces it with the bundle-derived set.

- **0BSD**: jsc-safe-url@0.2.4 [mobile], tslib@2.8.1 [mobile]
- **Apache-2.0**: detect-libc@2.1.2 [root+mobile], agent-browser@0.39.4 [root], serve-sim@0.1.47 [root], typescript@7.0.2 [root], @typescript/typescript-linux-x64@7.0.2 [root], sherpa-onnx-linux-x64@1.12.37 [root], xcode@3.0.1 [mobile], baseline-browser-mapping@2.11.20 [mobile], chrome-launcher@0.15.2 [mobile], lighthouse-logger@1.4.2 [mobile], marky@1.3.0 [mobile], chromium-edge-launcher@0.2.0 [mobile], exponential-backoff@3.1.3 [mobile], fb-watchman@2.0.2 [mobile], bser@2.1.1 [mobile], walker@1.0.8 [mobile], human-signals@2.1.0 [mobile], @chevrotain/types@11.1.2 [mobile], @typescript/native-preview@7.0.0-dev.20260707.2 [mobile], @typescript/native-preview-linux-x64@7.0.0-dev.20260707.2 [mobile], remend@1.4.0 [mobile]
- **BlueOak-1.0.0**: sax@1.6.0 [root+mobile], glob@13.0.6 [mobile], minimatch@10.2.5 [mobile], minipass@7.1.3 [mobile], path-scurry@2.0.2 [mobile], lru-cache@11.3.6 [mobile]
- **BSD-2-Clause**: json-schema-typed@8.0.2 [root], regjsparser@0.13.1 [mobile], terser@5.51.2 [mobile], terser@5.49.1 [mobile], esprima@4.0.1 [mobile], fontfaceobserver@2.3.0 [mobile], css-select@5.2.2 [mobile], css-what@6.2.2 [mobile], domhandler@5.0.3 [mobile], domelementtype@2.3.0 [mobile], domutils@3.2.2 [mobile], entities@4.5.0 [mobile], nth-check@2.1.1 [mobile], webidl-conversions@3.0.1 [mobile]
- **BSD-3-Clause**: fast-uri@3.1.9 [root], qs@6.16.1 [root], smol-toml@1.9.1 [root+mobile], bcrypt-pbkdf@1.0.2 [root], stream-chain@4.2.6 [root], stream-json@3.7.0 [root], @react-native/debugger-frontend@0.83.10 [mobile], makeerror@1.0.12 [mobile], tmpl@1.0.5 [mobile], source-map@0.5.7 [mobile], source-map@0.6.1 [mobile], babel-plugin-istanbul@6.1.1 [mobile], sprintf-js@1.1.3 [mobile], istanbul-lib-instrument@5.2.1 [mobile], istanbul-lib-coverage@3.2.2 [mobile], @sinonjs/fake-timers@10.3.0 [mobile], @sinonjs/commons@3.0.1 [mobile], source-map-js@1.2.2 [mobile], @expo/xcpretty@4.4.4 [mobile], ieee754@1.2.1 [mobile], rtl-detect@1.1.2 [mobile], istanbul-lib-instrument@6.0.3 [mobile], istanbul-lib-report@3.0.1 [mobile], istanbul-lib-source-maps@4.0.1 [mobile], istanbul-reports@3.2.0 [mobile], highlight.js@11.11.1 [mobile], d3-ease@3.0.1 [mobile], rw@1.3.3 [mobile], d3-sankey@0.12.3 [mobile], d3-array@2.12.1 [mobile], d3-shape@1.3.7 [mobile], d3-path@1.0.9 [mobile], hoist-non-react-statics@3.3.2 [mobile], hyphenate-style-name@1.1.0 [mobile]
- **(BSD-3-Clause OR GPL-2.0)**: node-forge@1.4.0 [mobile]
- **CC0-1.0**: mdn-data@2.0.14 [mobile]
- **CC-BY-4.0**: caniuse-lite@1.0.30001810 [mobile]
- **ISC**: which@2.0.2 [root+mobile], isexe@2.0.0 [root+mobile], inherits@2.0.4 [root+mobile], setprototypeof@1.2.0 [root+mobile], once@1.4.0 [root+mobile], wrappy@1.0.2 [root+mobile], zod-to-json-schema@3.25.2 [root], graceful-fs@4.2.11 [root+mobile], semver@7.7.4 [root+mobile], signal-exit@3.0.7 [root+mobile], cliui@6.0.0 [root], get-caller-file@2.0.5 [root+mobile], require-main-filename@2.0.0 [root], set-blocking@2.0.0 [root], which-module@2.0.1 [root], y18n@4.0.3 [root], yargs-parser@18.1.3 [root], yaml@2.9.1 [root+mobile], picocolors@1.1.1 [mobile], semver@7.8.5 [mobile], electron-to-chromium@1.5.416 [mobile], lru-cache@5.1.1 [mobile], yallist@3.1.1 [mobile], semver@6.3.1 [mobile], glob@7.2.3 [mobile], fs.realpath@1.0.0 [mobile], inflight@1.0.6 [mobile], minimatch@3.1.5 [mobile], cliui@8.0.1 [mobile], y18n@5.0.8 [mobile], yargs-parser@21.1.1 [mobile], @isaacs/ttlcache@1.4.1 [mobile], rimraf@3.0.2 [mobile], yaml@2.9.0 [mobile], @istanbuljs/load-nyc-config@1.1.0 [mobile], test-exclude@6.0.0 [mobile], anymatch@3.1.3 [mobile], write-file-atomic@4.0.2 [mobile], npm-package-arg@11.0.3 [mobile], hosted-git-info@7.0.2 [mobile], lru-cache@10.4.3 [mobile], proc-log@4.2.0 [mobile], validate-npm-package-name@5.0.1 [mobile], @ungap/structured-clone@1.3.1 [mobile], v8-to-istanbul@9.3.0 [mobile], semver@7.6.3 [mobile], lucide-react-native@1.14.0 [mobile], boolbase@1.0.0 [mobile], d3-selection@3.0.0 [mobile], d3-transition@3.0.1 [mobile], d3-color@3.1.0 [mobile], d3-dispatch@3.0.1 [mobile], d3-interpolate@3.0.1 [mobile], d3-timer@3.0.1 [mobile], d3@7.9.0 [mobile], d3-array@3.2.4 [mobile], internmap@2.0.3 [mobile], d3-axis@3.0.0 [mobile], d3-brush@3.0.0 [mobile], d3-drag@3.0.0 [mobile], d3-chord@3.0.1 [mobile], d3-path@3.1.0 [mobile], d3-contour@4.0.2 [mobile], d3-delaunay@6.0.4 [mobile], delaunator@5.1.0 [mobile], d3-dsv@3.0.1 [mobile], d3-fetch@3.0.1 [mobile], d3-force@3.0.0 [mobile], d3-quadtree@3.0.1 [mobile], d3-format@3.1.2 [mobile], d3-geo@3.1.1 [mobile], d3-hierarchy@3.1.2 [mobile], d3-polygon@3.0.1 [mobile], d3-random@3.0.1 [mobile], d3-scale@4.0.2 [mobile], d3-time@3.1.0 [mobile], d3-time-format@4.1.0 [mobile], d3-scale-chromatic@3.1.0 [mobile], d3-shape@3.2.0 [mobile], d3-zoom@3.0.0 [mobile], internmap@1.0.1 [mobile], libsodium-wrappers@0.8.4 [mobile], libsodium@0.8.4 [mobile], libsodium-wrappers-sumo@0.8.4 [mobile], libsodium-sumo@0.8.4 [mobile]
- **MIT AND Apache-2.0**: @expo-google-fonts/material-symbols@0.4.34 [mobile]
- **(MIT OR Apache-2.0)**: fb-dotslash@0.5.8 [mobile]
- **(MIT OR CC0-1.0)**: type-fest@0.7.1 [mobile], type-fest@0.21.3 [mobile], type-fest@5.6.0 [mobile]
- **(MPL-2.0 OR Apache-2.0)**: dompurify@3.4.17 [mobile]
- **Python-2.0**: argparse@2.0.1 [root+mobile]
- **SEE LICENSE IN README.md**: @anthropic-ai/claude-agent-sdk@0.3.284 [root] (confirmed inside `out/orcad/orcad-server.js`)
- **no `license` field in package.json**: ssh2@1.17.0 [root], cpu-features@0.0.10 [root], buildcheck@0.0.7 [root], exit@0.1.2 [mobile], khroma@2.1.0 [mobile]
- **Unlicense**: fast-sha256@1.3.0 [root], tweetnacl@0.14.5 [root], tweetnacl@1.0.3 [root+mobile], stream-buffers@2.2.0 [mobile], big-integer@1.6.52 [mobile], robust-predicates@3.0.3 [mobile]

The root dev closure (not shipped unless bundled) also carries non-SPDX entries: `oxlint-plugin-react-doctor@0.9.14` (`SEE LICENSE IN LICENSE`), and no-field `@stablyai/playwright*@2.1.16`, `@react-grab/cli@0.1.34`, `format@0.2.2`; the bundle-derived method decides whether any of them ship (none is expected to).

## Appendix B: Plan split (item 7)

**Wave 1, executable now (Phase 62 merged):**
- **68-01 artifacts:** `release.yml` (`build-linux` Orca steps and host-root env, `windows-orca`, `macos-orca-arm64`, `macos-orca-x64`, `macos-orca-universal`, `build-windows` needs and env, sign zip regex), `scripts/build-orca.sh` (platform-guarded objdump, portable listing), `package-{linux,windows,macos}.sh`, `win-sign-list.mjs`, `verify-package-target-natives.mjs`, new `verify-orca-packaged-tree.mjs`, new `verify-orca-packaged-live.mjs` (written and self-tested; run in wave 2), `verify-release-shape.mjs`, `verify-build-windows-shape.mjs`, Flatpak manifest and checker, Windows staged-Node path in `OrcaService`/`TheiaService` (or a WINDOWS.md re-date), `docs/BUILD.md`.
- **68-02 re-pin:** `rebase-orca.yml`, `rebase-orca.sh` (+ `--replay-only`), `release-train.yml`, `release-train.mjs`, `detect-upstreams.mjs`, `verify-upstream-pins.mjs`, `verify-workflows.mjs` (rules for the new jobs if any), `verify-orca-slotless-start.mjs --orcad-only`, `docs/RELEASING.md`.
- **68-03 protocol and upstream tooling:** `verify-orca-mobile-protocol.mjs` (both rows), `seams.json` `upstream` key and `verify-orca-overlay.mjs` (`ROW_KEYS`, today `['patch', 'path', 'reason', 'upstream_blob']` at `:53`), `export-orca-seam-pr.mjs` with fixture self-test; S1 classified `browser-provider` provisionally.
- **68-04 licensing:** `generate-licensing.mjs`, new `scripts/lib/orca-shipped-packages.mjs`, `THIRD-PARTY-NOTICES.txt`, `LICENSING.md`, `inventory/licence-allowlist.json` (permissive key and exception rows pending the owner ruling; reason text without the pin value), `verify-licence-allowlist.mjs`.

**Wave 2, after Phase 67:**
- **68-05 upstream seams:** classify the final seams from 63, 64, 66; write `orca-overlay/upstream/<seam-id>/` tests; run the export for each D-27 class; owner hand-off list for the end pass; `orca-upstream-prs` row with its exclusion.
- **68-06 coordinator:** merge order 03, 04, 01, 02 (wave 1) then 05; brand re-measure; container release build and `package-linux.sh`; packaged rows plus `orca-packaged-tree`; `orca-packaged-live`; every full Orca row of 60-67 (PLAT-02 Linux pass); WINDOWS.md entries: macOS release artifact with Orca (Phase 55 items 8-9), macOS smoke, Windows smoke (CF-10), Windows staged-Node path if not fixed, upstream PRs, SDK ruling; ROADMAP/STATE.
