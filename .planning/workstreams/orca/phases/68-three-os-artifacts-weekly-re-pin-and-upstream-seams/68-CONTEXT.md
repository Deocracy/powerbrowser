# Phase 68: Three-OS artifacts, weekly re-pin and upstream seams - Context

**Gathered:** 2026-11-09
**Status:** Ready for planning
**Mode:** Smart discuss, auto mode (Chris 2026-11-09: "Claude takes the recommended answers, keeps going"). Every P68 decision is Claude's recommended pick; Chris may override any of them before the dependent work lands or in the end-of-milestone pass (59-CONTEXT D-18).

<domain>
## Phase Boundary

The Orca integration ships inside the Linux, macOS and Windows artifacts, with the node-pty prebuild built per target on that target's own runner and Flatpak granted `--filesystem=home` (PLAT-01). The live checks pass on Linux, and macOS and Windows smoke results are recorded when a host exists (PLAT-02, D-24). The release train re-pins Orca weekly to the newest tag, re-applies the seam patches, typechecks PowerBrowser's added files and stops for a human on a conflict (OVL-02, D-26). A check proves the overlay leaves orcad's mobile-facing protocol untouched and reports the pin lag against the current stock app (OVL-03, D-23, D-29). The terminal provider, browser provider and extra web entry seams are prepared as upstream pull requests (OVL-06, D-27). Success criteria are the five in ROADMAP Phase 68.

Phases 63-67 are not built. What Phase 68 can fix now: the packaged layout, the per-OS build jobs, the re-pin workflow and its self-test, the protocol-file check, the licence surface of the shipped Orca closure, and the tooling that prepares an upstream pull request. What waits: the final seam list (Phases 63, 64, 66), the packaged root resolution inside `OrcaService` (Phase 62), the pairing-offer surface the stock mobile app scans (Phase 67), and the Linux live pass over the finished feature set (all of 62-67). Each such pick says "depends on Phase NN".

Out of scope: the Orca mobile fork and any Android APK release (D-21, D-22, D-23: next milestone); iOS; Microsoft or Apple signing, notarization or store listings (2026-11-01 ruling); the Windows 11 VM (CF-10, re-dated under 59-CONTEXT D-09); any change to the `main-review` ruleset.

</domain>

<decisions>
## Implementation Decisions

### Packaged layout (PLAT-01, criterion 4)
- **P68-01 (Claude's pick): Orca ships as `<GreD>/orca/` holding `package.json`, `out/orcad/` and `out/web/`, exactly the paths `scripts/build-orca.sh` leaves under `orca/` (lines 104-117), so the packaged tree and a dev tree have one shape.** `out/orcad/` already carries `out/cli`, `out/mobile-web` and `node_modules/{node-pty,@parcel/watcher,@linear/sdk,emojibase-data}`; `out/web/` is 73 MB, `out/orcad/` 57 MB. Nothing else from `orca/` is staged: no `node_modules` at the root, no `out/orcad-prebuilds`, no `out/runtimes` (de-slotted, D-14). orcad runs on the one staged Node (`<GreD>/node/bin/node`, Windows `<GreD>/node/node.exe`), so the artifact carries no second runtime. **Depends on Phase 62:** `OrcaService` reads its root from the pref `powerbrowser.orca.root` (62-02-PLAN `start()`); Phase 68 adds the packaged default, an empty pref resolving to `<GreD>/orca` by the same `getAppDir` rule `TheiaService` uses for `<GreD>/theia`. ORCA_VERSION keeps coming from `<root>/package.json` (P62-19). **Amended after research: P68-32.**

### Per-OS Orca build (PLAT-01, criterion 4)
- **P68-02 (Claude's pick): Linux builds Orca inside `build-linux` on legion, after "Build the Theia sidecar" (`.github/workflows/release.yml:154-156`), as `bash scripts/fetch-orca.sh` then `nix develop .#orca --command bash scripts/build-orca.sh`.** The overlay is applied inside `build-orca.sh` (P62-09), so the release build and the dev build run one procedure. `package-linux.sh` stages `<GreD>/orca` beside `theia/` and `node/`, and extends three existing passes to it: the `patchelf --remove-rpath` loop (lines 83-85, which today walks `theia` and `node` only), the checkout-path grep (lines 93-95), and the precomplete refresh, which already runs after staging. The Flatpak module copies the tarball's tree (`flatpak/org.debios.PowerBrowser.json` `build-commands`), so it inherits `<GreD>/orca` with no second staging step. **Amended after research: P68-29.**
- **P68-03 (Claude's pick): Windows builds Orca on a new hosted job `windows-orca` on `windows-latest`, beside `windows-sidecar` and with its trust shape (`release.yml:241-353`): no secret, no write token, Node from `node-runtime.json` `win32-x64` through `actions/setup-node`, pnpm from corepack at Orca's `packageManager`, and a `SHA256SUMS` whose digest leaves the job as an output outside the artifact.** `build-windows` admits it with `powerbrowser/packaging/check-win-sidecar.sh` (the same `check` and `purge` modes, pointed at the Orca directory) before `package-windows.sh` stages `<GreD>/orca`. Legion never builds a Windows native, as for the sidecar. `scripts/win-sign-list.mjs` today stops on "an extra PE file" not named by the pinned package manifest (`release.yml:721-733`), so it learns the PE files under `orca/` from the admitted `SHA256SUMS`, compared as a set. `sign-windows` keeps its skip-when-no-Azure path (R14, `release.yml:623-628`), and nothing on the Linux path gains a `needs:` on a Windows job (win-sign-chain row; memory "Windows sign never blocks Linux"). Research item: which of `build-orca.sh`'s steps need a Windows variant (the shell-entry check requires `objdump`, line 56; the `rebuild:node` and prebuild steps use Orca's own `initialize-windows-native-toolchain.mjs`). **Amended after research: P68-30.**
- **P68-04 (Claude's pick): macOS builds Orca on a hosted job `macos-orca` with two runners (arm64 and x64), each producing a thin tree admitted by the same digest rule; `package-macos.sh <arch>` stages `Contents/Resources/orca`, and `universal` merges each thin Mach-O pair with `lipo` as it already does for `.node`, `rg` and `node` (`docs/BUILD.md` "macOS universal package (plan 55-03)").** The merge rule "every other file must be byte-identical" fails on any Orca file whose name carries the architecture; research derives those names from Orca's `SERVER_TARGETS` and `MATRIX_SLOTS` (`orca/config/scripts/build-orcad-prebuilds.mjs:38-47`) and the merge learns that rule from them, not from a list. `release.yml` has no `build-macos` job and the macOS Gecko cross-build is blocked (`docs/BUILD.md` "Not run on this tree yet", `BLOCKED.md` items 8 and 9; v1.6 Phase 55 deferral), so Phase 68 lands the job, the staging and the checks, proves them on the hosted thin trees and on synthetic fixtures, and the coordinator records the missing macOS artifact in `.planning/WINDOWS.md` with an owner date. **Amended after research: P68-31.**
- **P68-05 (Claude's pick): each target's node-pty prebuild is built only on that target's own runner, by Orca's own `build:orcad`, which builds the host slot when it is missing (`orca/config/scripts/build-orcad-node.mjs:53-71`).** PowerBrowser never passes `--target` for a foreign slot and never runs `merge-orcad-prebuilds.mjs`; a missing slot is Orca's own error "build it on a <target> runner". node-pty ships although every terminal is a Theia terminal (D-01), because orcad probes it at startup (D-28). Whether Phase 63's provider removes that need **depends on Phase 63**; PLAT-01 keeps the prebuild either way.

### Artifact checks (PLAT-01, criterion 4)
- **P68-06 (Claude's pick): criterion 4 adds one new row and extends three existing ones; no sibling driver.**
  - `orca-packaged-tree` (full; `-self-test` quick), new, `--target linux-x64|win64|macos`: derives the expected file set from the built `orca/out/{orcad,web}` plus `orca/package.json` at the pin, then compares it as a set with the staged `<GreD>/orca`. It goes red on a missing file, an extra file, any Node executable, a slot marker (names derived from `orca/src/shared/orcad-artifacts.ts`, reusing `verify-orca-build-shape.mjs`'s exported `walk` and `NODE_NAMES`), an Electron binary, or a prebuild manifest slot that is not the target's. The self-test plants each of these. **Amended after research: P68-33.**
  - `package-target-natives`: its universe changes from file names (`.node`, `rg`, `node`; `scripts/verify-package-target-natives.mjs:3-8`) to file magic (every ELF, PE or Mach-O file in the staged tree). Orca's ripgrep, `agent-browser-<target>` and computer-use binaries are then judged by architecture too. The self-test gains a wrong-architecture plant under `orca/` and an unnamed executable plant.
  - `portable-elf` and `sidecar-no-symlinks` already walk the whole extracted tarball; they cover `<GreD>/orca` once it is staged, and the glibc 2.28 floor (`powerbrowser/packaging/portability-floor.json`) applies to Orca's natives as well.
  - `flathub-manifest`: see P68-07.
  - `release-shape` and `build-windows-shape` learn the new jobs. `release-shape` also requires `orca-packaged-tree` among the packaged labels `build-linux` runs before upload (`release.yml:194`).
- **P68-07 (Claude's pick): `--filesystem=home` joins the Flatpak `finish-args`, and `scripts/verify-flathub-manifest.mjs` adds it to `SANDBOX_ALLOW` with the reason "Orca worktrees, agent CLIs and their credentials live under HOME (2026-11-04 platforms decision)".** The least-privilege set equality (lines 160-164) stays, so `--filesystem=host` stays red (existing plant at line 383), and a new plant removes `--filesystem=home` and must go red.

### Weekly re-pin (OVL-02, criterion 1)
- **P68-08 (Claude's pick): the weekly tick is decided in `release-train.yml`'s `sweep-clock`, beside the Theia inflow tick (`release-train.yml:639-720`), by a new pure `orcaDue(nowMs, lastSweepMs)` in `scripts/release-train.mjs`: due on the first daily sweep of each ISO week (Monday, or the next sweep after a missed Monday).** There is no `schedule:` key (D-77); the clock App's dispatch is the only wake. An owner dispatch input `repin-orca` runs it at once, as `renovate-theia` does. `orcaDue` gets fixtures in the release-train self-test like `theiaDue`'s (`scripts/release-train.mjs:2333-2336`).
- **P68-09 (Claude's pick): a new `detect-orca` job (contents and pull-requests read) lists `git ls-remote --tags` of the remote named once in `scripts/fetch-orca.sh:23`, and a new `detect-upstreams.mjs --orca-select` picks the candidate: the newest tag matching `^v[0-9]+\.[0-9]+\.[0-9]+$`, strictly newer than `orca_tag` in `configuration.toml`, with its peeled commit from the `^{}` line.** An open `chore/orca-*` PR is a hold, as for ESR and Node. The strict tag pattern is required: the Orca remote also carries `mobile-android-v*`, `mobile-ios-v*`, `mobile-v*`, `pr-*` and `backup/*` tags (read 2026-11-09). The newest tag only, never a walk back through intermediate tags (D-26: "against the newest Orca tag"). At gathering time the pin is v1.4.248 and the newest tag v1.4.255. **Amended after research: P68-34.**
- **P68-10 (Claude's pick): the replay is one definition, `.github/workflows/rebase-orca.yml` (`workflow_dispatch` and `workflow_call`, `tag` and `commit` inputs with no default, a `stage` output, `ubuntu-latest`, `contents: read`, `persist-credentials: false`), the same shape as `rebase-upstream.yml:1-70`. It runs a new `scripts/rebase-orca.sh --tag <t> --commit <c>` in `nix develop .#orca`.** The script runs these stages in order. Each prints one stage line, and the first FAIL line is the job's `stage` output.
  1. `fetch`: `fetch-orca.sh` with the `TAG=`/commit override, the hook P59-02 left for this job.
  2. `seam-apply <patch>`: applies the overlay (P62-09) with the blob-hash check, then regenerates the seam patches.
  3. `typecheck:web` and `typecheck:node`: Orca's own scripts (`orca/package.json`), run as-is.
  4. `typecheck coverage`: every PB-added overlay source file must appear in the program of the matching tsconfig (`tsc --listFilesOnly -p config/tsconfig.tc.web.json` and `config/tsconfig.node.json`). This keeps a file outside the program from passing vacuously.
  5. `build-orca.sh`.
  6. The rows `orca-build-shape`, `orca-overlay`, `orca-overlay-built`, `orca-mobile-protocol` and `licence-allowlist`.
  7. The orcad half of `orca-slotless-start`, because P59-05 makes the start probe re-run on every new tag.
  8. The brand scan.

  The web-tab pairing half of `orca-slotless-start` needs a built PowerBrowser and runs in the Linux live pass (P68-20). Research item: whether `verify-orca-slotless-start.mjs` already separates the orcad half; if not, it gains an `--orcad-only` mode. **Amended after research: P68-28.**
- **P68-11 (Claude's pick): a green run bumps only `orca_tag` and `orca_commit` in `configuration.toml`, the regenerated `orca-overlay/patches/`, and the upstream blob hashes in `orca-overlay/seams.json`.** The bump job stages these by explicit path and fails on any other change, with the same check as `bump-pr`'s UNEXPECTED step (`release-train.yml:518-526`). Each of these stops the run for a human: a seam patch that no longer applies, a regenerated seam over the 20-line bound (P62-17), a seam count over the cap, a type error, a typecheck coverage miss, a changed Orca LICENSE (the `licence-allowlist` digest), a protocol-file hit (P68-15), and a brand-scan red. **Amended after research: P68-35 (the bump job replays only), P68-24 (licence row reason text).**
- **P68-12 (Claude's pick): "re-pins by itself" means a `bump-pr-orca` job publishes `chore/orca-<tag>` and arms auto-merge on its PR. The job runs in the `bot` environment with the App token and `scripts/publish-bump-branch.sh`, as `bump-pr-node` does (`release-train.yml:565-637`), and arms auto-merge with `gh pr merge --auto --merge`; `.github/settings/repo.json` declares `allow_auto_merge: true`.** The `main-review` ruleset requires one approving review and the `verify` check (`.github/settings/ruleset-main-review.json`), and `scripts/verify-repo-controls.mjs:383` forbids any App bypass (GH-05). The owner's approving review is therefore the one remaining human step. No ruleset changes. — **Reversibility:** cheap. A later owner ruling can widen this; no setting is touched now. **Amended after research: P68-35.**
- **P68-13 (Claude's pick): a red or conflicting run opens or updates one tracking issue per candidate tag, `release-train: orca <tag> stopped`, from the `report` job, which already holds the file's only `issues: write` (`release-train.yml:1413-1424`).** The issue carries the stage line: the patch that did not apply, the file and line of the type error, or the scan row. No branch and no PR are published. The pin stays at the current tag. The fallback pin is the current pin, never a downgrade: D-04's 1.4.245 fallback applied only to the Phase 60 start probe, which 1.4.248 passed (60-03-SUMMARY). A dry run prints the would-write lines. The Phase 52 fixer is not extended; it already refuses F1 replay conflicts (`release-train.yml:86`).
- **P68-14 (Claude's pick): criterion 1's "a planted conflict and a planted type error each stop it" is a quick row `rebase-orca-self-test`.** It is hermetic: a local `file://` fixture Orca repository with two `v` tags and a fixture `package.json` whose `typecheck:*` scripts are small Node checkers, so no pnpm and no network are needed. Control green first; then each plant must stop the run at its named stage: a seam conflict (`seam-apply <patch>`), a type error in an overlay file (`typecheck:web <file>:<line>`), an overlay file outside the tsconfig program (`typecheck coverage`), a planted brand token, and a changed LICENSE. `scripts/verify-upstream-pins.mjs` is extended to require that `rebase-orca.yml` carries no tag, no commit and no `schedule:` key, as it already does for `rebase-upstream.yml`. `scripts/verify-workflows.mjs` covers the new jobs. **Amended after research: P68-28 (fixture remote, SKIP is red).**

### Mobile protocol and pairing (OVL-03, criterion 2)
- **P68-15 (Claude's pick): a new row `orca-mobile-protocol` (quick when `orca/` exists, printed SKIP otherwise; `-self-test` quick) derives the protected file set from the pinned source and requires it to share no path with `seams.json` upstream paths or `orca-overlay/files/`.** The protected set is the transitive relative-import closure into `orca/src/**` from two roots:
  - `orca/mobile/src/**`, which imports `../../../src/shared/protocol-version` (`mobile/src/notifications/push-registration.ts:20` and others), so it reaches every file the stock app shares with orcad;
  - orcad's runtime RPC and relay entry modules (`src/main/runtime/runtime-rpc/`, `src/main/ipc/mobile.ts`).

  The set comes from the closure, never from a list of names. A hit is red naming the file. The self-test plants a seam on `src/shared/protocol-version.ts` and an overlay file that shadows a closure file. **Amended after research: P68-26.**
- **P68-16 (Claude's pick): the pin lag and compatibility are computed automatically by a full row `orca-mobile-skew`, which the re-pin report also prints.** The row:
  1. lists the newest `mobile-android-v*` tag on the Orca remote (0.0.64 on 2026-11-09; the pinned tree's `mobile/app.json` says 0.0.62);
  2. reads `mobile/src/transport/protocol-version.ts` at that tag through a one-blob shallow fetch (`MOBILE_PROTOCOL_VERSION`, `MIN_COMPATIBLE_DESKTOP_VERSION`);
  3. reads the pinned `src/shared/protocol-version.ts:41-43` (`RUNTIME_PROTOCOL_VERSION = 3`, `MIN_COMPATIBLE_RUNTIME_CLIENT_VERSION = 2`);
  4. evaluates them with Orca's own `evaluateRuntimeCompat` from the pinned `src/shared/protocol-compat.ts`, imported by Node 24's type stripping and not copied by hand.

  It reports the Orca tag lag, the app version lag and the verdict. A `blocked` verdict is red: the stock app would refuse PowerBrowser's orcad, and a re-pin is due. The self-test uses fixture constants with no network. **Amended after research: P68-27.**
- **P68-17 (Claude's pick): pairing the stock Android app with PowerBrowser's orcad is a human check deferred to the end-of-milestone pass (59-CONTEXT D-18).** It needs an Android device. It goes through Orca's relay, because PowerBrowser's orcad binds loopback only (P62-03) and the relay host `.onorca.dev` is a user-initiated egress row (P62-15). PowerBrowser adds no LAN bind. The pass records the pairing result next to the `orca-mobile-skew` output, so the risk D-29 records (a newer stock app against the pinned orcad) is measured, not assumed. **Depends on Phase 67:** RUN-07's containment must leave the mobile pairing QR reachable where Orca shows it.

### Upstream seams (OVL-06, criterion 3)
- **P68-18 (Claude's pick): each D-27 seam is offered as one pull request against Orca's `main`, generic, naming no PowerBrowser identifier, with Orca's tests, and preceded by an issue.** Orca's `.github/pull_request_template.md` states that an outside contributor's PR with no linked issue is ignored. Phase 68 prepares and does not open. A new `scripts/export-orca-seam-pr.mjs <seam-id>` writes these to `.mozbuild/orca-upstream/<seam-id>/`:
  - the seam rebased onto Orca's current `main` as a patch;
  - an issue body;
  - a PR body in the template's sections (ELI5, What Changed, Why, Linked Issue, Visual Proof `N/A`, Testing);
  - the `pnpm test` command from Orca's `AGENTS.md:4`.

  Opening the issue and the PR, and choosing the fork and the GitHub org, are owner actions deferred to the end-of-milestone pass (59-CONTEXT D-18; ROADMAP open item; the org is moving to `deocracy`, so no org name is written into any file). Agents never fork, push or open anything upstream. **Amended after research: P68-36.**
- **P68-19 (Claude's pick): the seam table is `orca-overlay/seams.json` (P62-09). Each row gains an `upstream` object, `{ "class": "terminal-provider" | "browser-provider" | "web-entry" | "pb-only", "pr": null | "<url>" }`.** The overlay gate (`verify-orca-overlay.mjs`) requires the key on every row. A non-null `pr` must match `https://github.com/<owner>/<repo>/pull/<n>`, with owner and repo derived from `fetch-orca.sh`'s REMOTE. `pr` stays null until the owner records the URL in the end pass; checking that a PR is open needs the network and runs in that pass. Build independence needs no new row: the build reads only the pinned tag and commit, which `orca-pin` already proves. **Depends on Phases 63, 64 and 66** for the final rows: the terminal provider (63), the extra web entry (64) and the browser provider (66). The Phase 62 hidden-Electron seam in `src/main/orcad/orcad-browser-provider.ts` (P62-14) goes into the browser-provider PR if the Phase 66 seam lands in the same file. Otherwise it is classed `pb-only`.

### Linux live checks (PLAT-02, criterion 5)
- **P68-20 (Claude's pick): a new full row `orca-packaged-live` runs under `flock /home/chris/coding/Power-Browser/.git/pb-live.lock`.** It extracts the release tarball that the coordinator builds locally with `package-linux.sh` in the `pb-gecko-build` container, then launches the packaged binary (the `ng063-packaged-launch` pattern). It requires:
  - `OrcaService` ready from `<GreD>/orca`;
  - `realpath(/proc/<orcad>/exe)` equal to `<GreD>/node/bin/node`;
  - the web client paired in a PowerBrowser web tab (the `orca-slotless-start` probe pointed at the packaged root);
  - orcad and its daemon reaped on quit.

  After the merges the coordinator runs every full Orca row of Phases 60-67 once on the merged tree; this is the PLAT-02 Linux pass. The macOS and Windows smoke tests are deferred until a host exists (D-24, 59-CONTEXT D-18). The Windows VM is CF-10, already re-dated. **Depends on Phases 62-67:** the live pass is only meaningful over the finished feature set, so Phase 68 closes after them.

### Licence surface of the shipped closure
- **P68-21 (Claude's pick): `scripts/generate-licensing.mjs` extends `THIRD-PARTY-NOTICES.txt` with the production dependency closure of what ships: orcad, the web client, and the `mobile-web` bundle that `build:orcad` stages.** The closure is derived at the pin from Orca's two lockfiles (`pnpm list --prod --json --depth Infinity` in `orca/` and `orca/mobile/`). Each package's SPDX id is checked against `inventory/licence-allowlist.json` `allowed_spdx`. A `NONE`, `UNLICENSED` or `SEE LICENSE IN ...` package that ships is never passed silently: it is a named entry that requires an owner ruling. This is the scan 60-04 left to Phase 68 (`licence_surface_note` in the `orca` row). The Anthropic agent SDK in Orca's root workspace declares `SEE LICENSE IN README.md`. If it is in the shipped closure, it becomes an owner ruling in the end pass, and no release is cut before that ruling. **Amended after research: P68-24 (method), P68-25 (lane 68-04 deliverables); the SDK and the per-package permissive set are open owner rulings 68-A and 68-B.**

### Mechanics
- **P68-22 (Claude's pick): four lanes with disjoint files, run as Orca child workspaces (59-CONTEXT D-07), then the coordinator merges them (D-08).**
  - **p68-01 artifacts:** `release.yml`; `powerbrowser/packaging/package-{linux,windows,macos}.sh` and `check-win-sidecar.sh`; `scripts/win-sign-list.mjs`; `verify-package-target-natives.mjs`; new `verify-orca-packaged-tree.mjs`; `verify-release-shape.mjs`; `verify-build-windows-shape.mjs`; `flatpak/org.debios.PowerBrowser.json`; `verify-flathub-manifest.mjs`; the packaged-root default in `OrcaService.sys.mjs` (depends on Phase 62); `docs/BUILD.md`.
  - **p68-02 re-pin:** new `.github/workflows/rebase-orca.yml`; new `scripts/rebase-orca.sh`; `release-train.yml`; `scripts/release-train.mjs`; `scripts/detect-upstreams.mjs`; `verify-upstream-pins.mjs`; `verify-workflows.mjs`; `docs/RELEASING.md`.
  - **p68-03 protocol and upstream:** new `verify-orca-mobile-protocol.mjs` (both rows); the `seams.json` schema and `verify-orca-overlay.mjs`; new `scripts/export-orca-seam-pr.mjs`.
  - **p68-04 licensing:** `scripts/generate-licensing.mjs`; `THIRD-PARTY-NOTICES.txt`; `LICENSING.md`; `inventory/licence-allowlist.json`; `verify-licence-allowlist.mjs`.

  Only the coordinator edits `.planning/workstreams/orca/STATE.md`, `.planning/workstreams/orca/ROADMAP.md`, `.planning/WINDOWS.md`, `inventory/brand-tokens.json` (Orca-family rows carry exact counts, so they are re-measured once on the staged merged tree, 60-04 rule) and `ledger/`. The coordinator also resolves `scripts/verify-platform.sh`, where each lane appends its rows in its own commented block.

  Merge order is 03, 04, 01, 02. Lane 02's stages call rows by label and its self-test runs on fixtures, so it can be built before 03 merges. The container release build and P68-20 run on the coordinator after all merges, one Gecko build at a time (59-CONTEXT D-05). No human checks run inside the lanes (D-18). No agent pushes or writes a secret store. The new release-train and release jobs take effect only when Chris pushes `main`. **Amended after research: P68-37.**
- **P68-23 (Claude's pick): no user-facing copy is added in this phase.** Workflow FAIL lines, tracking-issue text and the export script's output are maintainer text. Any download-page or install text for the Orca mode waits for a later copy pass under the UI-SPEC rule.

### Amendments after research (Claude's picks, 2026-11-09, auto mode)
Each pick below applies one row of 68-RESEARCH.md "Context amendments" (A1-A13). The superseded or narrowed pick keeps its text above with a pointer here; where they differ, the amendment wins.

- **P68-24 (supersedes P68-21's method; research A11):** the per-package licence gate does not check package ids against `allowed_spdx`. That key is the tree-level allow-list (one row per fetched tree, `inventory/licence-allowlist.json` `$comment`), and Theia's shipped notices already carry ISC, BSD-3-Clause, Apache-2.0, BlueOak-1.0.0, Unlicense, Python-2.0 and dual-licence expressions; checking Orca's packages against it reds 184 of them. The per-package rule is:
  1. every shipped package gets a notice block, grouped by licence text as `theiaClosure`/`theiaGroups` do (`scripts/generate-licensing.mjs:156-213`);
  2. a package is red when it carries a non-SPDX or proprietary marker (`SEE LICENSE IN ...`, `UNLICENSED`, `NONE`, no `license` field and no licence file) or an expression with no permissive disjunct, unless the inventory holds a named row for it;
  3. the permissive set is a new inventory key (proposed name `allowed_package_spdx`), separate from `allowed_spdx`; its contents are open owner ruling 68-B.

  The shipped set is derived from the bundles, not from `pnpm list --prod`, which misses what Vite bundles into `out/web` (`react` and 38 renderer libraries are `devDependencies` in `orca/package.json`). The derivation:
  - an esbuild `metafile` pass with `write: false` that imports Orca's own exported entry config (`ORCAD_ENTRY_POINT`, `ORCAD_LAUNCHER_ENTRY_POINT`, `ORCAD_CHILD_ENTRY_POINTS`, `ORCAD_EXTERNAL_MODULES`, `ORCAD_BUNDLE_PLUGINS`, `orca/config/scripts/orcad-entry-build.mjs:11-71`) for `out/orcad`;
  - `node config/scripts/run-vite-web-build.mjs --sourcemap --outDir <scratch>` for `out/web` (the script forwards argv to `vite build`), reading package names from the maps' `sources`;
  - the staged `out/orcad/node_modules` packages (node-pty, `@parcel/watcher`, `@linear/sdk`, `emojibase-data`);
  - the mobile workspace's production closure for `out/mobile-web`.

  The `orca` row's `reason` in `inventory/licence-allowlist.json` is rewritten to name the manifest keys (`upstreams.orca_tag`, `upstreams.orca_commit`) instead of the pin value, so a re-pin leaves no stale text and the bump's explicit-path set stays as P68-11 lists it (research Pitfall 8). — **Reversibility:** cheap; the gate's rule is one function and the permissive set is one key.
- **P68-25 (amends P68-21; lane 68-04's deliverables):** lane 68-04 builds the derive-and-compare licence check and the notices generation, and reports the Anthropic agent SDK as a named pending-ruling entry. It neither passes the SDK nor fails silently.
  - New `scripts/lib/orca-shipped-packages.mjs` implements the P68-24 derivation. With no built `orca/`, its step prints one SKIP line and the tracked-only steps still run.
  - `generate-licensing.mjs` gains an Orca section in `THIRD-PARTY-NOTICES.txt` (orcad, web client, `mobile-web`). `--check` re-derives it and compares as a set both ways: a shipped package missing from the notices is red, and an Orca notice entry for a package that does not ship is red. `LICENSING.md` is regenerated, never hand-edited.
  - `verify-licence-allowlist.mjs` learns the per-package rule, the exception rows and a pending-ruling row shape. The inventory gains one pending row for `@anthropic-ai/claude-agent-sdk@0.3.284`. The row records: the marker `SEE LICENSE IN README.md`; the first line of its `LICENSE.md`; where it ships (`orca/out/orcad/orcad-server.js`, evidence `CLAUDE_AGENT_SDK_VERSION="0.3.284"`); the four options of ruling 68-A; and the `.planning/WINDOWS.md` entry id, which the coordinator assigns.
  - The quick rows (`licensing`, `licence-allowlist`) print `PENDING RULING -- @anthropic-ai/claude-agent-sdk@0.3.284 ...` and never count it among passing packages. A recorded pending row does not change their exit status, so the commit gate stays usable. A shipped non-SPDX package with no row at all is red. A pending row whose package no longer ships is red as stale.
  - A new full row, `orca-licence-rulings`, exits 1 naming every pending entry until a ruling replaces the row. The coordinator adds its `GATE_KNOWN_OPEN_EXCLUSIONS` entry keyed to the WINDOWS.md id.
  - Self-test plants, each red naming the package:
    - a `SEE LICENSE IN` package with no row;
    - a package with no field and no licence file;
    - a GPL-only expression;
    - a package in the metafile but absent from the notices;
    - a stale pending row;
    - a pending row printed as a pass.

  P68-21's rule stays: no release that carries the SDK is cut before ruling 68-A. Wiring that consequence into the release path is the coordinator's step after the ruling, because the release path depends on which option is chosen.
- **P68-26 (narrows P68-15's second root; research A8):** root 2 contributes its own files only: the 19 non-test files of `src/main/runtime/runtime-rpc/` plus `src/main/ipc/mobile.ts`, not their transitive closure. Root 1 (`orca/mobile/src/**` into `orca/src/**`) stays transitive. The protected set at the pin is 1779 files. A transitive root 2 reaches 8301 files (40% of `src/`), including `src/main/providers/local-pty/local-pty-runtime-spawn.ts`, Phase 63's planned seam S3, so P68-15 as written would forbid a seam that D-27 requires. Import extraction uses TypeScript's `preProcessFile` from `orca/node_modules/typescript`. If the TS 7.0.2 JS entry does not expose it (research assumption A14), the lane uses the regex the research used, which resolved 1779 files with 0 unresolved relative specifiers, and states that limit in the script header. A closure of size 0 is red ("source moved").
- **P68-27 (supersedes the function named in P68-16; research A9):** the skew verdict uses `evaluateCompat` (`orca/src/shared/protocol-compat.ts:73-101`, mirrored in `orca/mobile/src/transport/protocol-compat.ts:14-38`), not `evaluateRuntimeCompat` (`:18-51`, the CLI, renderer and remote-pairing check). Its inputs:
  - `mobileProtocolVersion` and `minCompatibleDesktopVersion`: from `mobile/src/transport/protocol-version.ts` at the newest `mobile-android-v*` tag;
  - `desktopProtocolVersion`: the pin's `RUNTIME_PROTOCOL_VERSION`;
  - `desktopMinCompatibleMobileVersion`: the pin's `MIN_COMPATIBLE_RUNTIME_CLIENT_VERSION`.

  These are the values orcad reports (`orca/src/main/runtime/orca-runtime-get-status.ts:174-175`) and the values the app evaluates (`mobile/src/transport/host-status-gates.ts:58-61`). Self-test fixtures: a `blocked` verdict, `mobile-too-old`, `desktop-too-old`, a tag listing with no app tag, and a moved constants file.
- **P68-28 (amends P68-10 and P68-14; research A6):**
  - **Stage 7.** `verify-orca-slotless-start.mjs` gains an `--orcad-only` mode. Today its `skipReason` SKIPs when no built PowerBrowser exists (`:118`), and `probeOrcad` always calls `pairWebTab` (`:224`), so on the re-pin runner it would print SKIP and exit 0. The script moves to lane 68-02.
  - **SKIP is red.** `rebase-orca.sh` turns any SKIP line from a row it calls into `FAIL -- <row> skipped`.
  - **Pin move before stage 5.** `rebase-orca.sh` moves the two pin lines in the runner's `configuration.toml` and runs `node scripts/generate.mjs` in `nix develop .#theia`. `orca-pin`, `orcaVersionFromPins()` and `fetch-orca.sh` read the pin through `generated/upstream-pins.env`, so without the move every row compares against the old pin.
  - **Brand scan.** Stage 8 is the tracked-tree scan without `--extra-root orca`, because Orca's own tree names Orca everywhere.
  - **Self-test remote.** The self-test reaches its `file://` fixture repository through functions that take a remote and a target, as `fetch-orca.sh` does (`:82-186`). There is never an environment variable that the production path reads.
  - **Self-test plants** gain "a called row prints SKIP", which must be red.
- **P68-29 (amends P68-02; research A12):** `package-linux.sh`'s checkout-path grep (`:93-95`) searches for the host build root, passed into the container as `PB_HOST_ROOT` from `release.yml:183` (`-e PB_HOST_ROOT="$PWD"`), not `$ROOT/`. In the container `ROOT` is `/src`, and `/src/` occurs in Theia's `bundle.js` and in five Orca output files. `package-windows.sh:67-71` records the same failure and its fix. This is a pre-existing defect that has not surfaced because the container package has never run on this tree (WINDOWS.md entry 30). The change lands before the grep is extended to `orca/`.
- **P68-30 (amends P68-03; research A2):**
  - **`build-orca.sh` portability.** The shell-entry check requires `objdump` only when `node -p process.platform` is `linux` (`build-orca.sh:134`; Orca uses `objdump` only in `linuxSlotRecord`). The overlay listing replaces `find -printf` (`:104`) with `find . -type f | sed 's|^\./||'`. The script moves to lane 68-01.
  - **Pins fragment.** The hosted job writes `generated/upstream-pins.env` with the generator's exported `emitUpstreamPins(config, 'release')` (`scripts/generate.mjs:3132-3166`, runs without inkscape) before `fetch-orca.sh` and `build-orca.sh` source it.
  - **Steps before the clone.** The job sets `git config --global core.longpaths true` and `core.autocrlf false`, adds a corepack `>= 0.34.5` gate (on failure it installs `corepack@0.35.0` under `$RUNNER_TEMP` and prepends it to PATH), and copies Orca's own `rustup target add x86_64-pc-windows-msvc` step.
  - **Sign zip filter.** The `sign-windows` zip-name filter (`release.yml:669`, `^[A-Za-z0-9._/-]+$`) and `win-sign-list.mjs` `NAME_RE` admit `@`, because Orca ships `node_modules/@parcel/watcher/` and `@linear/sdk/`. They keep refusing `..`, a leading slash and symlinks.
  - **Provenance file.** `orca/out/orcad-prebuilds/manifest.json` travels in the artifact as a separate top-level file. It is listed in `SHA256SUMS`, is removed at staging like `BUILD_ROOT`, and is read by `orca-packaged-tree` (P68-33).
- **P68-31 (amends P68-04; research A3):**
  - **Jobs.** macOS uses two separately named thin-tree jobs, `macos-orca-arm64` (`macos-15`) and `macos-orca-x64` (`macos-15-intel`), not a matrix, because matrix job outputs overwrite each other and each digest must leave as its own output.
  - **Merge.** One `macos-orca-universal` job on `ubuntu-latest` (GNU tools and `llvm-lipo`) admits both trees and merges them in a new `package-macos.sh orca-universal <arm64-dir> <x64-dir> <out>` mode, which `universal` later calls. It then runs `orca-packaged-tree --target macos` and `package-target-natives --target macos` on the merged tree.
  - **Pair map.** The arch-named pair map comes from Orca's `ORCAD_RIPGREP_ARTIFACTS` and `orcadAgentBrowserNativeName('darwin', arch)`. Each pair is merged with `lipo -create` and staged under both names, as `better-sqlite3` is (`package-macos.sh:175,191-192`). Same-name natives merge in place. Every other file must be byte-identical, and a difference is red naming the file.
  - **Bash gate.** The thin jobs gate `bash` major >= 4, because `build-orca.sh` uses `mapfile` (`:72,105`).
  - **Per-arch name check.** It classifies `orca/` content by magic, not by name, because `package-macos.sh:337-338` refuses any `*linux*` name and Orca ships `computer-use-linux/runtime.py` for every target.
  - **Scope.** Nothing consumes the universal tree in this phase. There is no DMG and no `build-macos`, and no job has `continue-on-error`.
- **P68-32 (supersedes P68-01's "Phase 68 adds the packaged default" clause; research A1):** the packaged default exists. `OrcaService` already prefers `<appDir>/orca` when `out/orcad/orcad.js` exists there and the pref has no user value (`powerbrowser/shell/OrcaService.sys.mjs:135-142`). Lane 68-01 instead fixes the Windows staged-Node path: `package-windows.sh:64` stages `node/node.exe`, while `OrcaService.sys.mjs:126` and `TheiaService.sys.mjs:570` look only for `<appDir>/node/bin/node` and then fall back to `pathSearch("node")`. Both services try `node/bin/node`, then `node/node.exe`, through the existing `pathExists` boundary method, so no new `PowerBrowserAPI` method or INTERNAL-APIS row is needed. The `TheiaService` edit requires re-running `shell-error-copy-no-internals`, `internals-boundary`, `start-path-recovery` and `orca-service`. This defect predates Phase 68 (Phase 54) and affects the Theia sidecar as well as orcad.
- **P68-33 (amends P68-06's slot clause; research A4):** the shipped tree has no prebuild manifest to read. `orca-packaged-tree` takes `--prebuild-manifest <orca/out/orcad-prebuilds/manifest.json>` and requires three things:
  - the manifest has exactly one slot;
  - that slot's `platform` and `arch`, which are the compiling host's `process.platform` and `process.arch` (`build-orcad-prebuilds.mjs:292-294`), equal the target;
  - the sha256 set of the staged `node_modules/node-pty/build/Release/*` equals that slot's `files`.

  This is the evidence that node-pty was built on the target's own runner (P68-05).
- **P68-34 (amends P68-09; research A5):** the selector accepts lightweight tags: the commit is the `^{}` line's sha when present, else the bare sha. Four `vN.N.N` tags on the remote are lightweight (`v1.0.3`, `v1.0.4`, `v1.0.5`, `v1.4.148`). Fixtures: `-rc.N`, `-rc.N.perf`, `mobile-android-v*`, a lightweight tag, not newer, equal, an open `chore/orca-*` hold, and `v1.4.9` against `v1.4.10` ordering.
- **P68-35 (amends P68-12 and P68-11's bump step; research A7 and Pattern 2):**
  - **Settings.** No `repo.json` edit: `allow_auto_merge` is already `true` (`.github/settings/repo.json:3`) and asserted (`scripts/verify-repo-controls.mjs:1229`). `main-review`'s single bypass actor is `OrganizationAdmin` with `bypass_mode: "always"` (`.github/settings/ruleset-main-review.json:14-49`), so the owner can also merge a re-pin PR without a review, by admin bypass. An `Integration` bypass stays refused (`verify-repo-controls.mjs:381-384`).
  - **No Orca code with the token.** `bump-pr-orca` never executes Orca code while the App token exists. It runs `rebase-orca.sh --replay-only`: fetch at tag and commit, `apply-patches.sh`, `regenerate-patches.sh`, rewrite the `seams.json` blobs, and move the two pin lines. It then stages by explicit path, and only after that mints the App token. The full gates have already run in `rebase-orca` under `contents: read`. `pnpm install` and `build:*` run Orca's scripts, which `bump-pr`'s Gecko replay never does, so the existing order (mint first) is not copied.
  - **Re-checks.** The tag (`^v[0-9]+\.[0-9]+\.[0-9]+$`) and commit (`^[0-9a-f]{40}$`) are re-checked by regex in every consuming job, and passed as environment values, never interpolated into `run:` text.
- **P68-36 (amends P68-18 and P68-19; research A10):**
  - **PR body headings.** The body follows the `## ` headings of Orca's `.github/pull_request_template.md`, derived at run time (14 at the pin), not a fixed six. A heading missing from the body is red in the export self-test.
  - **Upstream test files.** These live in `orca-overlay/upstream/<seam-id>/`, never in `orca-overlay/files/`. That directory is copied into the build, and every source file there must carry a marker that survives into a bundle (P62-20).
  - **Token refusal.** The export refuses a patch that contains a `PB`, `PowerBrowser` or `powerbrowser` token. Phase 63's planned switch `ORCA_PB_THEIA_PTY_ENDPOINT` (`63-CONTEXT.md:25`) fails that test; choosing a generic name is a Phase 63 matter (research Open Question 3), recorded here so the 63 planner sees it.
  - **S1 class.** The Phase 62 seam S1 is classed `browser-provider` provisionally in wave 1.
- **P68-37 (supersedes P68-22's lane set and timing; research A13):** two waves.
  - **Wave 1, executable now (Phase 62 is merged):**
    - **68-01 artifacts:** P68-22's lane-01 files, plus:
      - `scripts/build-orca.sh` (P68-30, P68-31);
      - the four new `release.yml` jobs and the `build-linux` host-root env;
      - the `release.yml` sign zip filter;
      - new `verify-orca-packaged-live.mjs`, written and self-tested here and run in wave 2;
      - the Windows staged-Node fix in both services (P68-32);
      - quick rows `orca-macos-merge-self-test` and `build-orca-portable-self-test`.
    - **68-02 re-pin:** P68-22's lane-02 files, plus `verify-orca-slotless-start.mjs --orcad-only` (P68-28).
    - **68-03 protocol checks:**
      - `verify-orca-mobile-protocol.mjs` (both rows);
      - the `seams.json` `upstream` key and `verify-orca-overlay.mjs` `ROW_KEYS`;
      - `export-orca-seam-pr.mjs` with its fixture self-test.
    - **68-04 licensing:** P68-22's lane-04 files, plus `scripts/lib/orca-shipped-packages.mjs` and the `orca-licence-rulings` row (P68-24, P68-25).

    Merge order stays 03, 04, 01, 02.
  - **Wave 2, after Phase 67:**
    - **68-05 upstream seam export:** classify the final seams of Phases 63, 64 and 66; write `orca-overlay/upstream/<seam-id>/` tests; run the export for each D-27 class; write the owner hand-off list for the end pass; add the `orca-upstream-prs` full row and its `GATE_KNOWN_OPEN_EXCLUSIONS` entry tied to a WINDOWS.md id.
    - **68-06 coordinator:**
      - merge 68-05;
      - re-measure the brand rows;
      - run the container release build and `package-linux.sh`;
      - run the packaged rows plus `orca-packaged-tree`, then `orca-packaged-live`;
      - run every full Orca row of Phases 60-67 (the PLAT-02 Linux pass);
      - write WINDOWS.md entries: the macOS release artifact with Orca (Phase 55 items 8-9), the macOS smoke test, the Windows smoke test (CF-10), upstream PRs, and ruling 68-A, with ruling 68-B noted under 68-A's entry;
      - update ROADMAP and STATE.

  The coordinator-only file list of P68-22 is unchanged.

### Ruling 68-A and the bundled extensions (2026-11-10)
- **P68-38 (owner ruling 68-A, Chris 2026-11-10, D-30; supersedes options (a)-(d) below and the SDK clauses of P68-21 and P68-25):** the SDK ships inside a pre-installed, user-removable PowerBrowser Theia extension that carries Anthropic's terms. orcad loads it through one generic seam. When the extension is absent or disabled, Orca's existing missing-package path applies. Claude terminal panes and the other agents are unaffected. Requirement BEXT-01.
  - **Theia facts (Theia 1.76 as PowerBrowser composes it).**
    - A built-in plugin (THEIA_DEFAULT_PLUGINS, `PluginType.System`) can be disabled: the Disable command has no built-in guard (`vsx-registry/lib/browser/vsx-extensions-contribution.js:95-99`), and the disabled set persists as `installedPlugins.disabledPlugins` in `<THEIA_CONFIG_DIR>/backend-settings.json` (`plugin-ext/lib/main/node/plugin-uninstallation-manager.js:37,43,52`; `core/lib/node/setting-service.js:72-75`).
    - A built-in cannot be uninstalled. Uninstall is rendered only for `!builtin` (`vsx-registry/lib/browser/vsx-extension.js:480`), and builtin means `PluginType.System` (`vsx-extensions-model.js:328-347`). The backend uninstall `fs.remove`s the plugin's source location (`plugin-ext/lib/hosted/node/plugin-deployer-handler-impl.js:178-187`), which for a built-in is the read-only app directory.
    - A user plugin is anything under `<THEIA_CONFIG_DIR>/deployedPlugins/`, which Theia scans as user entries (`plugin-ext-vscode/lib/node/plugin-vscode-deployer-participant.js:28-29`). Uninstall removes that directory.
    - The uninstalled set is memory-only (`plugin-uninstallation-manager.js:32`, never saved), so a seed needs its own record.
    - A newer deployed version uninstalls older ones of the same id (`plugin-deployer-handler-impl.js:195-212`).
    - A dot-prefixed entry in a plugins directory is skipped by the system scan (`plugin-ext/lib/main/node/resolvers/local-directory-plugin-deployer-resolver.js:39-45`).
    - `THEIA_CONFIG_DIR` is `<ProfD>/powerbrowser-theia` (`powerbrowser/shell/TheiaService.sys.mjs:615-623`).
  - **Packaging (lane 68-09).**
    - The tracked folder `bundled-extensions/claude-agent-sdk/` holds a VS Code manifest (id `powerbrowser.claude-agent-sdk`, version = the SDK version), a `package-lock.json` pinning the SDK by version and sha512 integrity, `LICENSE.md` quoting Anthropic's terms, and `README.md`.
    - `scripts/download-plugins.mjs` assembles it into `theia/applications/browser/plugins/.user/powerbrowser.claude-agent-sdk/extension/` with `npm ci --ignore-scripts --omit=optional --legacy-peer-deps`. Every OS job already runs this script in `yarn build` and stages `$APP/plugins` whole (`package-linux.sh:52`, `package-macos.sh:319`, `release.yml:318`), so no release or package script changes.
    - Not an `[[extensions]]` entry: that path pins an archive's sha256, and an archive packed with the SDK inside differs per npm version and OS. The npm lockfile integrity is the pin instead, and the `bundled-extensions` row requires it to equal Orca's own `pnpm-lock.yaml` entry.
    - Only the SDK's root export ships. Its `sdk.mjs` imports only Node built-ins, and its peers are reached only from the `./core` subpath, which Orca never imports. Its eight `@anthropic-ai/claude-agent-sdk-<os>-<arch>` optional packages are not shipped and are not installed in Orca's own tree, because Orca passes the user's `claude` CLI as `pathToClaudeCodeExecutable` (`orca/src/main/claude/claude-stream-json-connection.ts:47`). One extension therefore serves every OS.
  - **Seed (lane 68-09).**
    - A new `@powerbrowser/bundled-extensions` Theia backend extension binds a `PluginDeployerParticipant`. Its `onWillStart` runs before resolution (`plugin-deployer-impl.js:68-83`). It copies each `.user/<id>` from the plugins directories the deployer itself reads (THEIA_DEFAULT_PLUGINS and `--plugins`) into `<THEIA_CONFIG_DIR>/deployedPlugins/<id>/`.
    - The record of what was seeded is a backend-settings key. A user's uninstall sticks, and a newer shipped version replaces a present copy only.
    - Reinstalling after an uninstall has no affordance in v1.7; that is an open item.
  - **orcad (lane 68-07).**
    - Seam 1, `orca/src/main/claude/claude-stream-json-connection.ts` `loadClaudeAgentSdk`, reads `ORCA_CLAUDE_AGENT_SDK_DIR`:
      - unset: the stock `import('@anthropic-ai/claude-agent-sdk')`;
      - set: the entry is resolved by package self-reference inside that directory only;
      - empty, missing or resolved outside: a rejection with code `ERR_MODULE_NOT_FOUND`.
    - Seam 2 adds `@anthropic-ai/claude-agent-sdk` to `ORCAD_EXTERNAL_MODULES` (`orca/config/scripts/orcad-entry-build.mjs:37`). The seam count rises by two. Both are classed `pb-only` for now; the loader seam names no PowerBrowser token, so it may be offered upstream later, but D-27 names three seams and a fourth is an owner call.
  - **Chrome side (lane 68-07).**
    - At each orcad spawn, `OrcaService` reads `<ProfD>/powerbrowser-theia/backend-settings.json` through the existing `PowerBrowserAPI.readStateFile`. It sets `ORCA_CLAUDE_AGENT_SDK_DIR` to `<ProfD>/powerbrowser-theia/deployedPlugins/powerbrowser.claude-agent-sdk/extension/node_modules/@anthropic-ai/claude-agent-sdk`, or to the empty string when the id is disabled.
    - An uninstalled extension is a missing directory, which the seam reports at first use. The SDK is imported lazily, so the first start works once the seed has run.
    - A disable or uninstall takes effect at the next orcad start, as a Theia disable needs a reload.
    - No new `PowerBrowserAPI` method, no IPC, no INTERNAL-APIS row. The name is in `OrcaEnv`'s fixed set, so `expectedEnvNames` follows it.
  - **Licence (lane 68-04).** The SDK's `package_rulings` row takes status `extension`. That status is red while the SDK is in the derived Orca shipped set, or while the named extension folder is absent, so it is red from the 68-04 merge until the 68-07 and 68-09 merges. Its `terms_check: "pending"` keeps `--rulings` at exit 1, and so keeps release.yml's guard closed, until the owner confirms that Anthropic's terms permit redistribution (D-30).
  - **Lane files.** 68-07 shares `powerbrowser/shell/OrcaService.sys.mjs` with 68-01. 68-01 edits `_resolve()` and 68-07 edits `_spawnAndGate()`, about 190 lines apart. The coordinator merges 68-07 after 68-01 under merge rule (2b). Merge order: 03, 04, 01, 07, 09, 02, then 08.
  - **Reversibility:** cheap. Dropping the two seams and the extension restores the stock bundled build. The ruling itself is the owner's.
- **P68-39 (Claude's pick, BEXT-02, Chris 2026-11-10 scope addition):** uBlock Origin ships as `<GreD>/distribution/extensions/uBlock0@raymondhill.net.xpi`. On macOS the path is `Contents/Resources/distribution/extensions/`.
  - **How Gecko handles it.**
    - Gecko installs a distribution XPI into the profile scope on a profile's first start, with no network (`upstream/toolkit/mozapps/extensions/internal/XPIProvider.sys.mjs:3196-3280`, `XPIInstall.sys.mjs:4326-4378`).
    - It is enabled, because it is not a foreign install: the manifest arrives through `aManifests` (`XPIDatabase.sys.mjs:3298,3373`).
    - The user can disable or remove it. A removal sticks, because `extensions.installedDistroAddon.<id>` stays set (`XPIInstall.sys.mjs:4353-4360`), and a newer shipped version upgrades a present copy only (`:4338-4344`).
  - **Rejected alternatives.** Policy `ExtensionSettings` offers only `force_installed` and `normal_installed`, the modes `[[webextensions]]` emits (docs/REBRANDING.md), and neither can be removed by the user. Patch 050 is the extension tab host, not an installer.
  - **Pin.** `powerbrowser/packaging/bundled-xpi.json` follows the `node-runtime.json` pattern (version, url, sha256, licence, source). The file is the AMO-signed XPI, unmodified. Each package script stages it through one helper; there is no generator change.
  - **Background after a relaunch.** Upstream starts extension backgrounds only after `ExtensionParent.browserPaintedPromise`, a topic only a stock window sends. Patch 050 also resolves it on `extensions-late-startup`, which the shell sends (`scripts/verify-extension-actions-live.mjs:748-751`, 39-04/999.15). The live row therefore proves filtering after a relaunch with zero stock windows.
  - **Update hosts.** uBlock fetches updates for its default-on filter lists without user action. Those hosts, derived at check time from the XPI's `assets/assets.json`, get `allow` rows in `powerbrowser/endpoint-allowlist.json`. This is Claude's pick: the alternative, `user-initiated` with updates switched off, leaves stale filters. The owner may override.
  - **Licence.** The GPL-3.0-or-later notice goes in a "Bundled extensions" section of THIRD-PARTY-NOTICES.txt that also lists the agent SDK.
  - **Lane order.** Lane 68-08 runs after the 68-01, 68-04 and 68-09 merges (it edits their package scripts and licence files), and needs no Phase 67.
  - **Open items.**
    - The owner's reading of GPL-3.0 section 6 for conveying the unmodified XPI. The notice links the upstream source at the pinned tag.
    - Private-window access stays off by default, as for any extension.

### Open owner rulings (recorded, not picked by Claude)
- **RULED 2026-11-10 (D-30, P68-38): OPEN OWNER RULING 68-A, the Anthropic agent SDK ships inside `orca/out/orcad/orcad-server.js` under a proprietary licence.** The text below is kept as the record of the options; the chosen mechanism is P68-38. Facts (68-RESEARCH item 3 and Open Question 1):
  - `@anthropic-ai/claude-agent-sdk@0.3.284` is bundled into the 13 MB `orcad-server.js` (`CLAUDE_AGENT_SDK_VERSION="0.3.284"` is in the bundle). It is not in `ORCAD_EXTERNAL_MODULES` (`orca/config/scripts/orcad-entry-build.mjs:37`).
  - It is loaded lazily through `import('@anthropic-ai/claude-agent-sdk')` (`orca/src/main/claude/claude-stream-json-connection.ts:38`); every other reference is `import type`.
  - Its `package.json` declares `SEE LICENSE IN README.md`. Its `LICENSE.md` reads "© Anthropic PBC. All rights reserved. Use is subject to the Legal Agreements outlined here: https://code.claude.com/docs/en/legal-and-compliance."

  The options:
  - **(a)** Ship it under Anthropic's terms, with a notice entry carrying its `LICENSE.md` text. This requires the owner's reading of the linked legal agreements.
  - **(b)** Exclude it from PowerBrowser's orcad by adding it to the esbuild externals: a seam in `orca/config/scripts/orcad-entry-build.mjs:37`, a build script, not shipped code. Structured Claude sessions in orcad then fail at that dynamic import with a named error, while the rest of orcad runs. This costs one seam of the D-16 cap and one feature.
  - **(c)** Exclude it and resolve it at runtime from a user-installed copy (the precedent is the Claude Code extension in the licence allow-list `$comment`). orcad has no such resolution path, so this needs more seams.
  - **(d)** Hold Orca out of the release artifacts until (a), (b) or (c) is chosen.

  The research recommends (d) as the default state of the release jobs, with Orca staged only when a ruling key is present in the inventory, and (a) or (b) chosen in the end pass. That is a recommendation, not a pick. Until the owner rules, lane 68-04 reports the SDK as the named pending entry of P68-25, and no release that carries it is cut (P68-21).
- **OPEN OWNER RULING 68-B: the per-package permissive SPDX set (`allowed_package_spdx`, P68-24).**
  - **Proposed set (68-RESEARCH Open Question 2):** MIT, ISC, BSD-2-Clause, BSD-3-Clause, Apache-2.0, 0BSD, BlueOak-1.0.0, Unlicense, CC0-1.0, Python-2.0, MPL-2.0, CC-BY-4.0 (data only: `caniuse-lite`).
  - **Packages with no `license` field:** five, each needing a named exception row: `ssh2`, `cpu-features`, `buildcheck`, `exit`, `khroma`. The first three carry a LICENSE file that begins "Copyright Brian White. All rights reserved." followed by MIT-form text.
  - **Until the owner rules:** lane 68-04 writes the key with the proposed set and marks it pending in the inventory. The check prints one `PENDING RULING` line for the set itself, and the exception rows record the observed licence text. The owner may change the set, and any package that then falls outside it goes red by name.

### Claude's Discretion
- Script internals, the exact stage-line wording, the tracking-issue title format, fixture layout, how `orca-packaged-tree` maps `--target` to the staged root per OS, and whether the hosted Orca jobs cache the pnpm store (only by lockfile hash, never across trust boundaries).

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

- `.planning/workstreams/orca/phases/68-three-os-artifacts-weekly-re-pin-and-upstream-seams/68-RESEARCH.md` ("Context amendments", Open Questions 1 and 2, Appendix A licence list, Appendix B plan split), `68-VALIDATION.md`, `68-PATTERNS.md`.
- `.planning/workstreams/orca/ROADMAP.md` Phase 68 (five criteria, open items) and Hard constraints; `.planning/workstreams/orca/REQUIREMENTS.md` OVL-02, OVL-03, OVL-06, PLAT-01, PLAT-02.
- `.planning/workstreams/orca/DECISIONS.md`: D-04 (pin, overlay, weekly rebase), D-14 (Node), D-16 (seam cap), D-21 to D-23 (mobile), D-24 (live checks on Linux only), D-26 (weekly automated re-pin), D-27 (seams offered upstream), D-28 (node-pty probe), D-29 (protocol skew risk). `59-CONTEXT.md` D-05, D-07, D-08, D-09 and D-18.
- `.planning/workstreams/orca/phases/60-orca-from-source-on-theia-s-node/60-CONTEXT.md` (P59-02 TAG override, P59-05 start probe per tag, P59-12), `60-02-SUMMARY.md` (build-orca.sh, P60-R3/R4), `60-03-SUMMARY.md` (orca-run.mjs, slot-less probe), `60-04-SUMMARY.md` (licence allow-list, brand rows, the scan left to Phase 68).
- `.planning/workstreams/orca/phases/62-overlay-gate-and-powerbrowser-run-orcad/62-CONTEXT.md` (P62-09 overlay layout, P62-14 browser-provider seam, P62-15 egress, P62-17 seam bound, P62-19 Node rule) and `62-02-PLAN.md` (`OrcaService.start()` and the `powerbrowser.orca.root` pref).
- `.github/workflows/release.yml` (`build-linux`, `windows-sidecar`, `build-windows`, `sign-windows`), `.github/workflows/release-train.yml` (`detect`, `detect-node`, `bump`, `bump-pr`, `bump-pr-node`, `sweep-clock`, `renovate-theia`, `report`), `.github/workflows/rebase-upstream.yml`, `.github/settings/repo.json`, `.github/settings/ruleset-main-review.json`.
- `powerbrowser/packaging/package-linux.sh`, `package-windows.sh`, `package-macos.sh`, `check-win-sidecar.sh`, `node-runtime.json`, `portability-floor.json`; `flatpak/org.debios.PowerBrowser.json`.
- `scripts/build-orca.sh`, `scripts/fetch-orca.sh`, `scripts/verify-orca-pin.mjs`, `scripts/verify-orca-build-shape.mjs`, `scripts/verify-orca-slotless-start.mjs`, `scripts/lib/orca-run.mjs`, `scripts/rebase-upstream.sh`, `scripts/detect-upstreams.mjs`, `scripts/release-train.mjs`, `scripts/publish-bump-branch.sh`, `scripts/win-sign-list.mjs`, `scripts/verify-package-target-natives.mjs`, `scripts/verify-flathub-manifest.mjs`, `scripts/verify-repo-controls.mjs`, `scripts/generate-licensing.mjs`, `inventory/licence-allowlist.json`.
- Pinned Orca source (`orca/` at 965978bc): `config/scripts/build-orcad-node.mjs`, `build-orcad-prebuilds.mjs`, `src/shared/protocol-version.ts`, `src/shared/protocol-compat.ts`, `mobile/src/transport/protocol-version.ts`, `mobile/app.json`, `.github/CONTRIBUTING.md`, `.github/pull_request_template.md`, `AGENTS.md`.
- `docs/BUILD.md` ("Orca half", "macOS universal package (plan 55-03)", "Linux package"), `docs/RELEASING.md` ("macOS", "Train stages").
- `CLAUDE.md`: hard rules, the verification rules (derive and compare; a self-test per check), the brand-scan traps, the user-facing copy rule.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `rebase-upstream.yml` plus `scripts/rebase-upstream.sh`: the replay-workflow shape (no default tag, a `stage` output, read-only token, no `schedule:`) for `rebase-orca.yml`.
- `release-train.yml` `detect-node` / `bump-pr-node`: a separate detector and bump job per upstream, each with its own App token, so an Orca failure never reaches the ESR or Node path.
- `sweep-clock`'s `theia-due` and `theiaDue()`: the template for a calendar tick with no `schedule:` key.
- `windows-sidecar` plus `check-win-sidecar.sh`: a hosted native build admitted by a digest that travels outside the artifact, for `windows-orca` and `macos-orca`.
- `package-macos.sh universal`'s `lipo` merge and `verify-package-target-natives.mjs --target`: the per-target checks are already parameterised.
- `fetch-orca.sh`'s `TAG=` override, and `verify-orca-build-shape.mjs`'s exported `walk` and `NODE_NAMES`.

### Established Patterns
- One registry (`scripts/verify-platform.sh`): one row plus one `-self-test` row per check; full rows SKIP with a printed line, and packaged rows FAIL naming the build procedure when no package exists.
- Bump branches stage by explicit path and refuse any other change. The App may not push a workflow file.
- Third-party builds run with lifecycle scripts off and a scrubbed environment (`build-orca.sh` steps 3-6).
- Live runs take `flock /home/chris/coding/Power-Browser/.git/pb-live.lock`.

### Integration Points
- `build-linux` (legion), after the Theia sidecar step; `build-windows` admits `windows-orca` before staging; `package-macos.sh <arch>` and `universal`.
- `release-train.yml` `sweep-clock`, then `detect-orca`, `rebase-orca` (workflow_call), `bump-pr-orca`, and `report`.
- `orca-overlay/seams.json`: the seam table that the gate, the re-pin and the upstream export all read.
- `OrcaService` root resolution (Phase 62) for the packaged default.

</code_context>

<specifics>
## Specific Ideas

- The re-pin self-test proves each stop at its named stage, and proves the typecheck covers the overlay files, so a green typecheck cannot be vacuous.
- The protocol check derives its file set from the stock app's own imports, so a protocol file added upstream joins the set without an edit.
- The pin-lag report uses Orca's own compatibility function from the pinned tree, so PowerBrowser carries no copy of the rule.

</specifics>

<deferred>
## Deferred Ideas

- The Orca mobile fork, the Android APK release and iOS (next milestone, D-23).
- Any change to `main-review` that would let the bot merge without a review (see P68-12).
- Walking back through intermediate Orca tags when the newest is red (P68-09 takes the newest only).
- The macOS release job itself (`build-macos` in `release.yml`), which waits on the Phase 55 blockers (P68-04).

### Deferred Verification (59-CONTEXT D-18: one end-of-milestone pass)

| Item | Needs | Source |
|------|-------|--------|
| Stock Android Orca app pairs with PowerBrowser's orcad; record the result beside `orca-mobile-skew` | Android device, owner | P68-17, criterion 2 |
| Open the issue and the PR for each D-27 seam upstream; record each URL in `seams.json` | Owner's GitHub identity, org ruling | P68-18, P68-19, criterion 3 |
| First live weekly tick on GitHub: `orca-due`, the bump PR with auto-merge armed, the owner's approving review | Push of `main` by Chris | P68-08 to P68-12, criterion 1 |
| `release.yml` dispatch that produces the Linux and Windows artifacts with Orca on GitHub | Push of `main`, owner dispatch | P68-02, P68-03, criterion 4 |
| macOS smoke test of a build with Orca | A Mac, the Phase 55 blockers cleared | P68-04, criterion 5 |
| Windows smoke test of a build with Orca | The Windows VM (CF-10) | P68-03, criterion 5 |
| Owner ruling on any shipped package without an allowed SPDX id (the agent SDK's `SEE LICENSE IN README.md` if it ships) | Owner | P68-21 |
| Ruling 68-A: decided 2026-11-10 (D-30, P68-38). Remaining: the owner confirms that Anthropic's terms permit redistributing the SDK inside the pre-installed extension, then sets `terms_check` to confirmed | Owner | P68-38, D-30 |
| GPL-3.0 section 6 reading for the bundled uBlock Origin XPI (source offer form) | Owner | P68-39 |
| Ruling 68-B: the per-package permissive SPDX set and the five no-field exception rows | Owner | P68-24, ruling 68-B |

</deferred>

---

*Phase: 68-three-os-artifacts-weekly-re-pin-and-upstream-seams*
*Context gathered: 2026-11-09 (auto mode); amended after research 2026-11-09 (P68-24..P68-37, open owner rulings 68-A and 68-B)*
