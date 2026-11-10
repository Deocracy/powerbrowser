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
- **P68-01 (Claude's pick): Orca ships as `<GreD>/orca/` holding `package.json`, `out/orcad/` and `out/web/`, exactly the paths `scripts/build-orca.sh` leaves under `orca/` (lines 104-117), so the packaged tree and a dev tree have one shape.** `out/orcad/` already carries `out/cli`, `out/mobile-web` and `node_modules/{node-pty,@parcel/watcher,@linear/sdk,emojibase-data}`; `out/web/` is 73 MB, `out/orcad/` 57 MB. Nothing else from `orca/` is staged: no `node_modules` at the root, no `out/orcad-prebuilds`, no `out/runtimes` (de-slotted, D-14). orcad runs on the one staged Node (`<GreD>/node/bin/node`, Windows `<GreD>/node/node.exe`), so the artifact carries no second runtime. **Depends on Phase 62:** `OrcaService` reads its root from the pref `powerbrowser.orca.root` (62-02-PLAN `start()`); Phase 68 adds the packaged default, an empty pref resolving to `<GreD>/orca` by the same `getAppDir` rule `TheiaService` uses for `<GreD>/theia`. ORCA_VERSION keeps coming from `<root>/package.json` (P62-19).

### Per-OS Orca build (PLAT-01, criterion 4)
- **P68-02 (Claude's pick): Linux builds Orca inside `build-linux` on legion, after "Build the Theia sidecar" (`.github/workflows/release.yml:154-156`), as `bash scripts/fetch-orca.sh` then `nix develop .#orca --command bash scripts/build-orca.sh`.** The overlay is applied inside `build-orca.sh` (P62-09), so the release build and the dev build run one procedure. `package-linux.sh` stages `<GreD>/orca` beside `theia/` and `node/`, and extends three existing passes to it: the `patchelf --remove-rpath` loop (lines 83-85, which today walks `theia` and `node` only), the checkout-path grep (lines 93-95), and the precomplete refresh, which already runs after staging. The Flatpak module copies the tarball's tree (`flatpak/org.debios.PowerBrowser.json` `build-commands`), so it inherits `<GreD>/orca` with no second staging step.
- **P68-03 (Claude's pick): Windows builds Orca on a new hosted job `windows-orca` on `windows-latest`, beside `windows-sidecar` and with its trust shape (`release.yml:241-353`): no secret, no write token, Node from `node-runtime.json` `win32-x64` through `actions/setup-node`, pnpm from corepack at Orca's `packageManager`, and a `SHA256SUMS` whose digest leaves the job as an output outside the artifact.** `build-windows` admits it with `powerbrowser/packaging/check-win-sidecar.sh` (the same `check` and `purge` modes, pointed at the Orca directory) before `package-windows.sh` stages `<GreD>/orca`. Legion never builds a Windows native, as for the sidecar. `scripts/win-sign-list.mjs` today stops on "an extra PE file" not named by the pinned package manifest (`release.yml:721-733`), so it learns the PE files under `orca/` from the admitted `SHA256SUMS`, compared as a set. `sign-windows` keeps its skip-when-no-Azure path (R14, `release.yml:623-628`), and nothing on the Linux path gains a `needs:` on a Windows job (win-sign-chain row; memory "Windows sign never blocks Linux"). Research item: which of `build-orca.sh`'s steps need a Windows variant (the shell-entry check requires `objdump`, line 56; the `rebuild:node` and prebuild steps use Orca's own `initialize-windows-native-toolchain.mjs`).
- **P68-04 (Claude's pick): macOS builds Orca on a hosted job `macos-orca` with two runners (arm64 and x64), each producing a thin tree admitted by the same digest rule; `package-macos.sh <arch>` stages `Contents/Resources/orca`, and `universal` merges each thin Mach-O pair with `lipo` as it already does for `.node`, `rg` and `node` (`docs/BUILD.md` "macOS universal package (plan 55-03)").** The merge rule "every other file must be byte-identical" fails on any Orca file whose name carries the architecture; research derives those names from Orca's `SERVER_TARGETS` and `MATRIX_SLOTS` (`orca/config/scripts/build-orcad-prebuilds.mjs:38-47`) and the merge learns that rule from them, not from a list. `release.yml` has no `build-macos` job and the macOS Gecko cross-build is blocked (`docs/BUILD.md` "Not run on this tree yet", `BLOCKED.md` items 8 and 9; v1.6 Phase 55 deferral), so Phase 68 lands the job, the staging and the checks, proves them on the hosted thin trees and on synthetic fixtures, and the coordinator records the missing macOS artifact in `.planning/WINDOWS.md` with an owner date.
- **P68-05 (Claude's pick): each target's node-pty prebuild is built only on that target's own runner, by Orca's own `build:orcad`, which builds the host slot when it is missing (`orca/config/scripts/build-orcad-node.mjs:53-71`).** PowerBrowser never passes `--target` for a foreign slot and never runs `merge-orcad-prebuilds.mjs`; a missing slot is Orca's own error "build it on a <target> runner". node-pty ships although every terminal is a Theia terminal (D-01), because orcad probes it at startup (D-28). Whether Phase 63's provider removes that need **depends on Phase 63**; PLAT-01 keeps the prebuild either way.

### Artifact checks (PLAT-01, criterion 4)
- **P68-06 (Claude's pick): criterion 4 adds one new row and extends three existing ones; no sibling driver.**
  - `orca-packaged-tree` (full; `-self-test` quick), new, `--target linux-x64|win64|macos`: derives the expected file set from the built `orca/out/{orcad,web}` plus `orca/package.json` at the pin, then compares it as a set with the staged `<GreD>/orca`. It goes red on a missing file, an extra file, any Node executable, a slot marker (names derived from `orca/src/shared/orcad-artifacts.ts`, reusing `verify-orca-build-shape.mjs`'s exported `walk` and `NODE_NAMES`), an Electron binary, or a prebuild manifest slot that is not the target's. The self-test plants each of these.
  - `package-target-natives`: its universe changes from file names (`.node`, `rg`, `node`; `scripts/verify-package-target-natives.mjs:3-8`) to file magic (every ELF, PE or Mach-O file in the staged tree). Orca's ripgrep, `agent-browser-<target>` and computer-use binaries are then judged by architecture too. The self-test gains a wrong-architecture plant under `orca/` and an unnamed executable plant.
  - `portable-elf` and `sidecar-no-symlinks` already walk the whole extracted tarball; they cover `<GreD>/orca` once it is staged, and the glibc 2.28 floor (`powerbrowser/packaging/portability-floor.json`) applies to Orca's natives as well.
  - `flathub-manifest`: see P68-07.
  - `release-shape` and `build-windows-shape` learn the new jobs. `release-shape` also requires `orca-packaged-tree` among the packaged labels `build-linux` runs before upload (`release.yml:194`).
- **P68-07 (Claude's pick): `--filesystem=home` joins the Flatpak `finish-args`, and `scripts/verify-flathub-manifest.mjs` adds it to `SANDBOX_ALLOW` with the reason "Orca worktrees, agent CLIs and their credentials live under HOME (2026-11-04 platforms decision)".** The least-privilege set equality (lines 160-164) stays, so `--filesystem=host` stays red (existing plant at line 383), and a new plant removes `--filesystem=home` and must go red.

### Weekly re-pin (OVL-02, criterion 1)
- **P68-08 (Claude's pick): the weekly tick is decided in `release-train.yml`'s `sweep-clock`, beside the Theia inflow tick (`release-train.yml:639-720`), by a new pure `orcaDue(nowMs, lastSweepMs)` in `scripts/release-train.mjs`: due on the first daily sweep of each ISO week (Monday, or the next sweep after a missed Monday).** There is no `schedule:` key (D-77); the clock App's dispatch is the only wake. An owner dispatch input `repin-orca` runs it at once, as `renovate-theia` does. `orcaDue` gets fixtures in the release-train self-test like `theiaDue`'s (`scripts/release-train.mjs:2333-2336`).
- **P68-09 (Claude's pick): a new `detect-orca` job (contents and pull-requests read) lists `git ls-remote --tags` of the remote named once in `scripts/fetch-orca.sh:23`, and a new `detect-upstreams.mjs --orca-select` picks the candidate: the newest tag matching `^v[0-9]+\.[0-9]+\.[0-9]+$`, strictly newer than `orca_tag` in `configuration.toml`, with its peeled commit from the `^{}` line.** An open `chore/orca-*` PR is a hold, as for ESR and Node. The strict tag pattern is required: the Orca remote also carries `mobile-android-v*`, `mobile-ios-v*`, `mobile-v*`, `pr-*` and `backup/*` tags (read 2026-11-09). The newest tag only, never a walk back through intermediate tags (D-26: "against the newest Orca tag"). At gathering time the pin is v1.4.248 and the newest tag v1.4.255.
- **P68-10 (Claude's pick): the replay is one definition, `.github/workflows/rebase-orca.yml` (`workflow_dispatch` and `workflow_call`, `tag` and `commit` inputs with no default, a `stage` output, `ubuntu-latest`, `contents: read`, `persist-credentials: false`), the same shape as `rebase-upstream.yml:1-70`. It runs a new `scripts/rebase-orca.sh --tag <t> --commit <c>` in `nix develop .#orca`.** The script runs these stages in order. Each prints one stage line, and the first FAIL line is the job's `stage` output.
  1. `fetch`: `fetch-orca.sh` with the `TAG=`/commit override, the hook P59-02 left for this job.
  2. `seam-apply <patch>`: applies the overlay (P62-09) with the blob-hash check, then regenerates the seam patches.
  3. `typecheck:web` and `typecheck:node`: Orca's own scripts (`orca/package.json`), run as-is.
  4. `typecheck coverage`: every PB-added overlay source file must appear in the program of the matching tsconfig (`tsc --listFilesOnly -p config/tsconfig.tc.web.json` and `config/tsconfig.node.json`). This keeps a file outside the program from passing vacuously.
  5. `build-orca.sh`.
  6. The rows `orca-build-shape`, `orca-overlay`, `orca-overlay-built`, `orca-mobile-protocol` and `licence-allowlist`.
  7. The orcad half of `orca-slotless-start`, because P59-05 makes the start probe re-run on every new tag.
  8. The brand scan.

  The web-tab pairing half of `orca-slotless-start` needs a built PowerBrowser and runs in the Linux live pass (P68-20). Research item: whether `verify-orca-slotless-start.mjs` already separates the orcad half; if not, it gains an `--orcad-only` mode.
- **P68-11 (Claude's pick): a green run bumps only `orca_tag` and `orca_commit` in `configuration.toml`, the regenerated `orca-overlay/patches/`, and the upstream blob hashes in `orca-overlay/seams.json`.** The bump job stages these by explicit path and fails on any other change, with the same check as `bump-pr`'s UNEXPECTED step (`release-train.yml:518-526`). Each of these stops the run for a human: a seam patch that no longer applies, a regenerated seam over the 20-line bound (P62-17), a seam count over the cap, a type error, a typecheck coverage miss, a changed Orca LICENSE (the `licence-allowlist` digest), a protocol-file hit (P68-15), and a brand-scan red.
- **P68-12 (Claude's pick): "re-pins by itself" means a `bump-pr-orca` job publishes `chore/orca-<tag>` and arms auto-merge on its PR. The job runs in the `bot` environment with the App token and `scripts/publish-bump-branch.sh`, as `bump-pr-node` does (`release-train.yml:565-637`), and arms auto-merge with `gh pr merge --auto --merge`; `.github/settings/repo.json` declares `allow_auto_merge: true`.** The `main-review` ruleset requires one approving review and the `verify` check (`.github/settings/ruleset-main-review.json`), and `scripts/verify-repo-controls.mjs:383` forbids any App bypass (GH-05). The owner's approving review is therefore the one remaining human step. No ruleset changes. — **Reversibility:** cheap. A later owner ruling can widen this; no setting is touched now.
- **P68-13 (Claude's pick): a red or conflicting run opens or updates one tracking issue per candidate tag, `release-train: orca <tag> stopped`, from the `report` job, which already holds the file's only `issues: write` (`release-train.yml:1413-1424`).** The issue carries the stage line: the patch that did not apply, the file and line of the type error, or the scan row. No branch and no PR are published. The pin stays at the current tag. The fallback pin is the current pin, never a downgrade: D-04's 1.4.245 fallback applied only to the Phase 60 start probe, which 1.4.248 passed (60-03-SUMMARY). A dry run prints the would-write lines. The Phase 52 fixer is not extended; it already refuses F1 replay conflicts (`release-train.yml:86`).
- **P68-14 (Claude's pick): criterion 1's "a planted conflict and a planted type error each stop it" is a quick row `rebase-orca-self-test`.** It is hermetic: a local `file://` fixture Orca repository with two `v` tags and a fixture `package.json` whose `typecheck:*` scripts are small Node checkers, so no pnpm and no network are needed. Control green first; then each plant must stop the run at its named stage: a seam conflict (`seam-apply <patch>`), a type error in an overlay file (`typecheck:web <file>:<line>`), an overlay file outside the tsconfig program (`typecheck coverage`), a planted brand token, and a changed LICENSE. `scripts/verify-upstream-pins.mjs` is extended to require that `rebase-orca.yml` carries no tag, no commit and no `schedule:` key, as it already does for `rebase-upstream.yml`. `scripts/verify-workflows.mjs` covers the new jobs.

### Mobile protocol and pairing (OVL-03, criterion 2)
- **P68-15 (Claude's pick): a new row `orca-mobile-protocol` (quick when `orca/` exists, printed SKIP otherwise; `-self-test` quick) derives the protected file set from the pinned source and requires it to share no path with `seams.json` upstream paths or `orca-overlay/files/`.** The protected set is the transitive relative-import closure into `orca/src/**` from two roots:
  - `orca/mobile/src/**`, which imports `../../../src/shared/protocol-version` (`mobile/src/notifications/push-registration.ts:20` and others), so it reaches every file the stock app shares with orcad;
  - orcad's runtime RPC and relay entry modules (`src/main/runtime/runtime-rpc/`, `src/main/ipc/mobile.ts`).

  The set comes from the closure, never from a list of names. A hit is red naming the file. The self-test plants a seam on `src/shared/protocol-version.ts` and an overlay file that shadows a closure file.
- **P68-16 (Claude's pick): the pin lag and compatibility are computed automatically by a full row `orca-mobile-skew`, which the re-pin report also prints.** The row:
  1. lists the newest `mobile-android-v*` tag on the Orca remote (0.0.64 on 2026-11-09; the pinned tree's `mobile/app.json` says 0.0.62);
  2. reads `mobile/src/transport/protocol-version.ts` at that tag through a one-blob shallow fetch (`MOBILE_PROTOCOL_VERSION`, `MIN_COMPATIBLE_DESKTOP_VERSION`);
  3. reads the pinned `src/shared/protocol-version.ts:41-43` (`RUNTIME_PROTOCOL_VERSION = 3`, `MIN_COMPATIBLE_RUNTIME_CLIENT_VERSION = 2`);
  4. evaluates them with Orca's own `evaluateRuntimeCompat` from the pinned `src/shared/protocol-compat.ts`, imported by Node 24's type stripping and not copied by hand.

  It reports the Orca tag lag, the app version lag and the verdict. A `blocked` verdict is red: the stock app would refuse PowerBrowser's orcad, and a re-pin is due. The self-test uses fixture constants with no network.
- **P68-17 (Claude's pick): pairing the stock Android app with PowerBrowser's orcad is a human check deferred to the end-of-milestone pass (59-CONTEXT D-18).** It needs an Android device. It goes through Orca's relay, because PowerBrowser's orcad binds loopback only (P62-03) and the relay host `.onorca.dev` is a user-initiated egress row (P62-15). PowerBrowser adds no LAN bind. The pass records the pairing result next to the `orca-mobile-skew` output, so the risk D-29 records (a newer stock app against the pinned orcad) is measured, not assumed. **Depends on Phase 67:** RUN-07's containment must leave the mobile pairing QR reachable where Orca shows it.

### Upstream seams (OVL-06, criterion 3)
- **P68-18 (Claude's pick): each D-27 seam is offered as one pull request against Orca's `main`, generic, naming no PowerBrowser identifier, with Orca's tests, and preceded by an issue.** Orca's `.github/pull_request_template.md` states that an outside contributor's PR with no linked issue is ignored. Phase 68 prepares and does not open. A new `scripts/export-orca-seam-pr.mjs <seam-id>` writes these to `.mozbuild/orca-upstream/<seam-id>/`:
  - the seam rebased onto Orca's current `main` as a patch;
  - an issue body;
  - a PR body in the template's sections (ELI5, What Changed, Why, Linked Issue, Visual Proof `N/A`, Testing);
  - the `pnpm test` command from Orca's `AGENTS.md:4`.

  Opening the issue and the PR, and choosing the fork and the GitHub org, are owner actions deferred to the end-of-milestone pass (59-CONTEXT D-18; ROADMAP open item; the org is moving to `deocracy`, so no org name is written into any file). Agents never fork, push or open anything upstream.
- **P68-19 (Claude's pick): the seam table is `orca-overlay/seams.json` (P62-09). Each row gains an `upstream` object, `{ "class": "terminal-provider" | "browser-provider" | "web-entry" | "pb-only", "pr": null | "<url>" }`.** The overlay gate (`verify-orca-overlay.mjs`) requires the key on every row. A non-null `pr` must match `https://github.com/<owner>/<repo>/pull/<n>`, with owner and repo derived from `fetch-orca.sh`'s REMOTE. `pr` stays null until the owner records the URL in the end pass; checking that a PR is open needs the network and runs in that pass. Build independence needs no new row: the build reads only the pinned tag and commit, which `orca-pin` already proves. **Depends on Phases 63, 64 and 66** for the final rows: the terminal provider (63), the extra web entry (64) and the browser provider (66). The Phase 62 hidden-Electron seam in `src/main/orcad/orcad-browser-provider.ts` (P62-14) goes into the browser-provider PR if the Phase 66 seam lands in the same file. Otherwise it is classed `pb-only`.

### Linux live checks (PLAT-02, criterion 5)
- **P68-20 (Claude's pick): a new full row `orca-packaged-live` runs under `flock /home/chris/coding/Power-Browser/.git/pb-live.lock`.** It extracts the release tarball that the coordinator builds locally with `package-linux.sh` in the `pb-gecko-build` container, then launches the packaged binary (the `ng063-packaged-launch` pattern). It requires:
  - `OrcaService` ready from `<GreD>/orca`;
  - `realpath(/proc/<orcad>/exe)` equal to `<GreD>/node/bin/node`;
  - the web client paired in a PowerBrowser web tab (the `orca-slotless-start` probe pointed at the packaged root);
  - orcad and its daemon reaped on quit.

  After the merges the coordinator runs every full Orca row of Phases 60-67 once on the merged tree; this is the PLAT-02 Linux pass. The macOS and Windows smoke tests are deferred until a host exists (D-24, 59-CONTEXT D-18). The Windows VM is CF-10, already re-dated. **Depends on Phases 62-67:** the live pass is only meaningful over the finished feature set, so Phase 68 closes after them.

### Licence surface of the shipped closure
- **P68-21 (Claude's pick): `scripts/generate-licensing.mjs` extends `THIRD-PARTY-NOTICES.txt` with the production dependency closure of what ships: orcad, the web client, and the `mobile-web` bundle that `build:orcad` stages.** The closure is derived at the pin from Orca's two lockfiles (`pnpm list --prod --json --depth Infinity` in `orca/` and `orca/mobile/`). Each package's SPDX id is checked against `inventory/licence-allowlist.json` `allowed_spdx`. A `NONE`, `UNLICENSED` or `SEE LICENSE IN ...` package that ships is never passed silently: it is a named entry that requires an owner ruling. This is the scan 60-04 left to Phase 68 (`licence_surface_note` in the `orca` row). The Anthropic agent SDK in Orca's root workspace declares `SEE LICENSE IN README.md`. If it is in the shipped closure, it becomes an owner ruling in the end pass, and no release is cut before that ruling.

### Mechanics
- **P68-22 (Claude's pick): four lanes with disjoint files, run as Orca child workspaces (59-CONTEXT D-07), then the coordinator merges them (D-08).**
  - **p68-01 artifacts:** `release.yml`; `powerbrowser/packaging/package-{linux,windows,macos}.sh` and `check-win-sidecar.sh`; `scripts/win-sign-list.mjs`; `verify-package-target-natives.mjs`; new `verify-orca-packaged-tree.mjs`; `verify-release-shape.mjs`; `verify-build-windows-shape.mjs`; `flatpak/org.debios.PowerBrowser.json`; `verify-flathub-manifest.mjs`; the packaged-root default in `OrcaService.sys.mjs` (depends on Phase 62); `docs/BUILD.md`.
  - **p68-02 re-pin:** new `.github/workflows/rebase-orca.yml`; new `scripts/rebase-orca.sh`; `release-train.yml`; `scripts/release-train.mjs`; `scripts/detect-upstreams.mjs`; `verify-upstream-pins.mjs`; `verify-workflows.mjs`; `docs/RELEASING.md`.
  - **p68-03 protocol and upstream:** new `verify-orca-mobile-protocol.mjs` (both rows); the `seams.json` schema and `verify-orca-overlay.mjs`; new `scripts/export-orca-seam-pr.mjs`.
  - **p68-04 licensing:** `scripts/generate-licensing.mjs`; `THIRD-PARTY-NOTICES.txt`; `LICENSING.md`; `inventory/licence-allowlist.json`; `verify-licence-allowlist.mjs`.

  Only the coordinator edits `.planning/workstreams/orca/STATE.md`, `.planning/workstreams/orca/ROADMAP.md`, `.planning/WINDOWS.md`, `inventory/brand-tokens.json` (Orca-family rows carry exact counts, so they are re-measured once on the staged merged tree, 60-04 rule) and `ledger/`. The coordinator also resolves `scripts/verify-platform.sh`, where each lane appends its rows in its own commented block.

  Merge order is 03, 04, 01, 02. Lane 02's stages call rows by label and its self-test runs on fixtures, so it can be built before 03 merges. The container release build and P68-20 run on the coordinator after all merges, one Gecko build at a time (59-CONTEXT D-05). No human checks run inside the lanes (D-18). No agent pushes or writes a secret store. The new release-train and release jobs take effect only when Chris pushes `main`.
- **P68-23 (Claude's pick): no user-facing copy is added in this phase.** Workflow FAIL lines, tracking-issue text and the export script's output are maintainer text. Any download-page or install text for the Orca mode waits for a later copy pass under the UI-SPEC rule.

### Claude's Discretion
- Script internals, the exact stage-line wording, the tracking-issue title format, fixture layout, how `orca-packaged-tree` maps `--target` to the staged root per OS, and whether the hosted Orca jobs cache the pnpm store (only by lockfile hash, never across trust boundaries).

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

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

</deferred>

---

*Phase: 68-three-os-artifacts-weekly-re-pin-and-upstream-seams*
*Context gathered: 2026-11-09 (auto mode)*
