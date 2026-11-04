# Phase 54 (Windows) BLOCKED items

Recorded by the autonomous executor for plans 54-01 to 54-03. Each item names what is blocked, why an
agent cannot complete it, and the exact owner steps. Plan 54-04 (the owner checkpoint) was not executed.

## 1. Live build-windows run (release.yml, plan 54-01 Task 3)

- **What:** the `build-windows` job has never run. Its static shape is green (`build-windows-shape`), but
  nothing has built a Windows package on legion.
- **Why blocked:** a dispatch is a write against GitHub and a build on the legion runner. Neither is
  allowed for an agent.
- **Resolved from the pinned tree (review fix CR-02):**
  - The sysroot. The job no longer calls `get_vs.py` or sets `WINSYSROOT`. `--enable-bootstrap` in the generated
    mozconfig fetches the `vs` toolchain by itself: `upstream/build/moz.configure/windows-toolchain.configure:69-85`
    bootstraps it when `WINSYSROOT` is unset, and `upstream/taskcluster/kinds/toolchain/misc.yml:692-709`
    (`win64-vs2026`, alias `vs`, `local-toolchain: true`) names the hash-pinned `build/vs/vs2026.yaml` it is built
    from (the tool is `upstream/taskcluster/scripts/misc/get_vs.py`, run by the bootstrap itself).
  - The repackage arguments. `powerbrowser/packaging/package-windows.sh` passes every `required=True` argument:
    installer `--tag --setupexe --output --sfx-stub` (`upstream/python/mozbuild/mozbuild/mach_commands.py:3115-3152`,
    values from `upstream/toolkit/mozapps/installer/windows/nsis/makensis.mk` and
    `upstream/testing/mozharness/configs/repackage/`), mar `--input --mar --output --arch` (`mach_commands.py:3467-3475`).
    The `build-windows-shape` row derives the required set from that file at check time.
- **Still unverified until a live run (record, do not guess):**
  1. That the release container can run the bootstrap (network for the taskcluster index, disk) and carries
     `makensis`, `7zz`, `xz` and `bzip2`, which `mach package` (installer stage) and `make_full_update.sh` use. The
     host `mar` tool is expected at `objdir-windows-x86_64/dist/host/bin/mar`; the script fails naming the path if not.
  2. ~~`upstream/browser/installer/windows/app.tag` carries the stock `Title="Mozilla Firefox"`.~~ Resolved by gap
     plan 54-09 (R3): the generator emits `generated/installer/<variant>/app.tag` with `Title` from
     `identity.display_name`, and `package-windows.sh` and the `sign-windows` repackage step pass
     `--tag generated/installer/release/app.tag`. Upstream's file is no longer read. `installer-schema` compares the
     emitted file with upstream's lines at check time. The live half is the title shown by the first self-extractor run.
  3. The Windows SDK/MSVC bootstrap is fetched by hash-pinned payloads, but the `vs.tar.zst` task artifact comes
     from the taskcluster index; the owner decides whether that is acceptable for a release build.
- **Owner steps:**
  1. Complete item 8 (the hosted sidecar job), then dispatch the release workflow at the chosen SHA only after
     54-04's approval gates. The job stops at the staging step until then (it fails closed).

## 2. Installer registry namespace move (plan 54-02 Task 1, PKG-12)

- **What:** the plan moves the installer's `Software\Mozilla` keys to `Software\PowerBrowser`. Not done.
- **Why blocked:** the application reads the same keys from files outside patch 040, so an installer-only
  move would split the installer from the app:
  - `upstream/toolkit/components/utils/WindowsInstallsInfo.sys.mjs:56` reads TaskBarIDs under
    `Software\Mozilla\<app name>`.
  - `upstream/toolkit/components/extensions/NativeManifests.sys.mjs:25` uses `REGPATH = "Software\\Mozilla"`.
  - `upstream/browser/components/BrowserGlue.sys.mjs:839-844` uses `Software\Mozilla\Firefox`.
  The uninstall survey (`uninstaller.nsi:153`, `URLUninstallSurvey`) also opens a Mozilla host and is not
  in the plan's list.
- **Owner decision:** (a) move the installer and the app readers together in a new patch in the stack, or
  (b) keep `Software\Mozilla` and record it as a known identifier. Then remove or keep the survey URL.
- **Decided (R3, option a) and landed by gap plan 54-07 (G-54c, 2026-11-03):** patch 040 defines
  `AppRegRoot` as `Software\${BrandShortName}` (`@MOZ_APP_DISPLAYNAME@`, so `Software\PowerBrowser` in the release
  branding) and the new patch `045-powerbrowser-registry-root.patch` moves every key whose readers are NSIS or chrome JS:
  the root (`RegCleanMain`, the HKLM write test, `GetSecondInstallPath`), the `${BrandFullNameInternal}` install keys,
  `${AppName}\Installer`, `${AppName}\32to64DidMigrate` (reader `UpdateService.sys.mjs`) and `Uninstalled-<channel>`
  (reader `BrowserGlue.sys.mjs`; upstream's literal `Firefox` subkey became `${AppName}`). Both patches were regenerated
  with `regenerate-patches.sh`; a sparse scratch replay with `apply-patches.sh --upstream` matched `upstream/`'s index.
  makensis compiles `installer.nsi` (`installer-build-proof`) and `uninstaller.nsi` from the edited tree.
- **Residue that stays under `Software\Mozilla\${AppName}` (compiled readers; `check-patch-surface.sh` refuses
  compiled paths, D-72/D-73):** `TaskBarIDs` (`widget/windows/WinTaskbar.cpp`,
  `toolkit/mozapps/update/common/commonupdatedir.cpp`, and its JS reader `WindowsInstallsInfo.sys.mjs`), the
  `MOZ_LAUNCHER_SUBKEY` (`browser/app/winlauncher`), and `Software\Mozilla\MaintenanceService`
  (`toolkit/mozapps/update/common/updatehelper.h`, `pathhash.cpp`). `NativeManifests.sys.mjs` keeps
  `Software\Mozilla\NativeMessagingHosts`: third-party native hosts register there and the installer never writes it.
  Moving the residue needs the owner to add those compiled paths to `ALLOWED_COMPILED_PATHS` (an amendment of D-72/D-73,
  as Phase 57 B1 did) and a tier-3 build; that is an owner question, not done here.
- **Survey removed by gap plan 54-08 (R3, 2026-11-03):** patch 040 deletes `URLUninstallSurvey`, the finish-page
  survey checkbox (`MUI_FINISHPAGE_SHOWREADME*`), `un.Survey`, `$ShouldOpenSurvey` and the `un.onGUIEnd` branch that
  opened the survey host. The finish-page layout functions already handle a page without the checkbox. Not changed:
  the installer's `CustomAbort` survey (`AbortSurveyURL`), which runs only for a `Funnelcake` `distribution.ini`.

## 3. Installer wizard artwork (plan 54-02 Task 1, PKG-12)

- **What:** the wizard bitmaps and the `firefox64.ico` stand-in are not replaced.
- **Why blocked:** `brand/` holds only `mark.svg` and `HUMAN-REVIEW.md`. The fork's installer artwork does
  not exist in the tree, and `brand/HUMAN-REVIEW.md` requires a signed human review for any new file.
- **Owner steps:** supply the installer artwork, add it under `brand/`, and re-sign the review in
  `brand/HUMAN-REVIEW.md`. Then regenerate patch 040 with the artwork hunks.
- **Placeholder (R3, 2026-11-03):** the files the owner supplies, with the upstream stand-in each replaces
  (`upstream/browser/branding/unofficial/`, staged by `installer-build-proof`). None of these files exists yet; nothing
  in the tree references them until they land:
  - `brand/installer/wizHeader.bmp` (150x57, 24-bit BMP) replaces `wizHeader.bmp`;
  - `brand/installer/wizHeaderRTL.bmp` (150x57, 24-bit BMP) replaces `wizHeaderRTL.bmp`;
  - `brand/installer/wizWatermark.bmp` (164x314, 24-bit BMP) replaces `wizWatermark.bmp`;
  - `brand/installer/firefox64.ico` (16, 32, 48 and 64 px, as the stand-in) replaces `firefox64.ico`.
  After they land with a signed `brand/HUMAN-REVIEW.md` entry, the follow-up wires them through the branding emitter
  (the branding directory is generated, so no patch hunk is needed) and `installer-build-proof` drops the stand-in label.

## 4. LEG-01 trademark extension (plan 54-02 Task 2)

- **What:** `verify-trademark-surface` is not extended to the NSIS, application.ini, Info.plist and launcher
  subkey surfaces.
- **Why blocked:** the extension compares surfaces as strict set equality in both directions. Today it would
  name the `Software\Mozilla` keys in `uninstaller.nsi` and `installer.nsi`, and the survey host. A green
  extension needs items 2 and 3 settled first. Weakening the comparison to pass would defeat the row.
- **Owner steps:** settle items 2 and 3, then the extension can land with one plant per surface.

## 5. Installer rows widening (plan 54-02 Task 1)

- **What:** `verify-installer-schema` and `verify-installer-build-proof` do not yet assert the fork registry
  root and the dead uninstall ping.
- **Why blocked:** the registry assertion depends on item 2. The uninstall-ping `Return` is in patch 040 and
  is covered by `patches-regenerated`; the rows were not widened for it.

## 6. Live matrix (plan 54-03 Task 3, MTX-01)

- **What:** the pkg-win11 matrix has never run. The harness files are in `scripts/matrix/`.
- **Why blocked:** defining a libvirt domain, taking a snapshot, and running a Windows guest need the host,
  the Windows licence, and the owner's approval (54-04).
- **Owner steps:**
  1. Define the domain from `scripts/matrix/pkg-win11-domain.xml` (`virsh define`). The XML's disk and NVRAM
     paths and the OVMF template paths are placeholders for the host.
  2. Install Windows 11, the QEMU guest agent, and the stock browser for the coexistence cell. Take the
     `clean-baseline` snapshot.
  3. Attach the staged inputs (`setup.exe`, the complete MAR, `win-matrix-guest.ps1`) on a read-only CD-ROM.
  4. Build the inputs ISO (volume label `PBMATRIX`, from `scripts/matrix/win-matrix-schema.json`) holding
     `setup.exe`, the complete MAR of a HIGHER version than the installed one, `win-matrix-guest.ps1` and
     `win-matrix-schema.json`; set the guest to auto-logon a user (the guest agent runs scripts in session 0, so
     launching the browser, the SmartScreen dialog and closing the window go through a one-shot interactive
     scheduled task); then run `PB_MATRIX_ISO=<iso> scripts/matrix/win-matrix-run.sh`. The driver reverts once and
     runs the cells as a chain; it writes `BUILD_TARGET`, the maintenance-service state, the SmartScreen text and the
     registry diffs from guest observations. It still does not write the `background` cell (UPD-31, item 7): add it
     by hand to the record. A cell that fails may be accepted only by adding
     `"deferral": {"owner_approved": true, "reason": "..."}` to that cell by hand.
  5. `win-matrix-guest.ps1` could not be linted or run here (no PowerShell on the build host). Its first run is the
     owner's; expect to fix PowerShell mistakes in the live guest, and the install directory name
     (`%ProgramFiles%\PowerBrowser`) and executable name are assumptions to confirm.
  6. Patch 040 now defines `AppRegRoot` (54-07), so `win-matrix-record` expects `Software\PowerBrowser` in the
     registry diff and allows `Software\Mozilla` only under the product's own `Software\Mozilla\powerbrowser\`
     subkey (`TaskBarIDs`, the launcher subkey). Any other `Software\Mozilla` key in the diff is red.

## 7. Background update task (plan 54-03 Task 2, UPD-31)

- **What:** the background task is neither verified nor recorded as deferred on a real guest.
- **Why blocked:** verification needs the live guest. The deferral reason is a value from the guest's
  BackgroundUpdate state, not something the agent can write.
- **Owner steps:** after item 6, run the update cell with the app closed and record either the verified
  observables (task entry, `backgroundupdate.moz_log`, a staged apply while closed) or the exact REASON
  value and scheduler error.

## 8. Windows sidecar hosted job (plan 54-02 Task 3 handoff)

- **What:** `package-windows.sh` expects the sidecar in `PB_WIN_SIDECAR_DIR`, built on `windows-latest` with a
  `SHA256SUMS` manifest. No hosted job produces it yet.
- **Why blocked:** a new hosted job is a Phase 50 pipeline change and a live run. The static shape of that
  job is not in this phase's plans.
- **Owner steps:** add the `windows-latest` sidecar job under Phase 50. It must upload the sidecar with a
  `SHA256SUMS` that lists every file, plus a `BUILD_ROOT` file (listed in the manifest) holding its workspace root
  (for example `D:\a\<repo>\<repo>`), and it must record the SHA-256 of `SHA256SUMS` OUTSIDE the artifact (a job
  output or an attestation). Then wire the artifact into `build-windows` as `windows-sidecar/` and the digest into
  `PB_WIN_SIDECAR_SUMS_SHA256` (today a repository variable placeholder in `release.yml`). `build-windows` stops
  at the staging step, failing closed, until both exist.
- **Resolved statically by gap plan 54-05 (G-54a, 2026-11-03):** `release.yml` has the hosted `windows-sidecar` job
  (`windows-latest`, contents read, no secret). It builds the sidecar from `inputs.sha`, stages the `package-linux.sh`
  layout, writes `BUILD_ROOT` and `SHA256SUMS`, admits its own output with `check-win-sidecar.sh check` and `purge`,
  and exposes the `SHA256SUMS` digest as the job output `sums_sha256`. `build-windows` needs it, downloads the
  artifact into `windows-sidecar/` and reads `PB_WIN_SIDECAR_SUMS_SHA256` from that output. **No repository variable
  is created**, because a variable cannot carry a per-run digest inside the run that produces it.
  `package-windows.sh` now admits the artifact by `lib/backend/main.js`, the path `TheiaService.sys.mjs` loads.
  `build-windows-shape` checks the edge and the producer (40 plants). **Live half (owner, 54-04 Task 3 step 5):**
  the first `release.yml` dispatch runs this job for the first time. Record the `windows-sidecar` run link and the
  printed `SHA256SUMS sha256` line in `54-04-SUMMARY.md`.

## 9. Windows leftover sidecar reap (review fix CR-03, UPD-30 follow-up)

- **What:** `PowerBrowserAPI.signalBarePid` and `readProcessStartTicks` are Linux-only (libc `kill`, `/proc`).
  A sidecar `node.exe` left behind by a crashed Windows launch is therefore not reaped at the next start; the
  stale state file is removed and the leftover is left alone.
- **Why open:** the quit and restart reap (the UPD-30 blocker) is fixed and platform-independent, because it waits
  on the Subprocess handle. A bare-pid reap on Windows needs a verified process-identity check (creation time via
  `kernel32`), behind `PowerBrowserAPI.sys.mjs` and catalogued; it is a new feature, not a fix.
- **Owner decision:** build it, or accept that a Windows crash can leave one orphan `node.exe` until reboot.

## 10. Unsigned Windows publish path: R2 conflicts with immutable releases (G-54b, written 2026-11-03 by gap plan 54-06)

- **What:** R2 asks for Windows assets joined to the Release, the descriptor commit and channel-live, and for the
  Windows path never to be a dependency of `sign-publish`, `descriptor` or `channel-live` for Linux.
- **Why blocked:** the `Immutable releases consequence` section of `docs/RELEASING.md` says that once immutable
  releases are enabled, an asset cannot be added after publication. `sign-publish` creates the draft with every asset
  in one call and publishes it once. A Windows job that does not gate that publish therefore reaches an
  already-published Release, and the upload is refused. Both halves of R2 cannot hold together while immutable
  releases are on. Also, `build-windows` and `build-linux` share the one legion runner, so a publish that waited for
  Windows would wait up to the Windows build time (300-minute job timeout, plus the 60-minute sidecar job).
- **Landed regardless (54-06):** `win-sign-chain` `independence` now covers every Windows job, derived from artifact
  names. A future Windows publish job may need `sign-publish` and `build-windows`, but no Linux job may need it.
- **Owner decision**, then Claude writes the follow-up gap plan (54-07) for the chosen option:
  - **(a) Recommended: Windows publishes after the Linux publish, on the MAR origin, not on the GitHub Release.**
    The jobs are `publish-windows`, `descriptor-windows` and `channel-live-windows`. `publish-windows` needs
    `build-windows` and `sign-publish` (environment `release`). It runs the MAR channel gate, signs and verifies the
    Windows complete MAR with the MAR key, and copies the unsigned installer, the signed MAR and a Windows
    `SHA256SUMS` write-once to `downloads.powerbrowser.org/<tag>/`. `descriptor-windows` (environment `descriptor`)
    commits the `WINNT_x86_64-msvc` `update.xml`. `channel-live-windows` checks the Windows descriptor. The rows widened
    are `release-asset-set` (a `windows-x86_64` row in the asset table), `release-shape` (the R2 credential in one more
    step) and `channel-live`. The Release stays immutable and Linux-only. The download page links the Windows files
    on the MAR origin, and the SEC-03 copy "Check the download against SHA256SUMS" points at the Windows
    `SHA256SUMS` there.
  - **(b) Keep "joined to the Release": the single publish waits for the Windows outcome.** The `--draft=false` step
    moves to a final job that needs `sign-publish` and `publish-windows` with `if: always() &&
    needs.sign-publish.result == 'success'`. A Windows failure does not stop Linux, but every Linux release waits
    up to about six hours for the Windows build. This contradicts "Linux ships alone" (ruling 2026-11-01) in timing.
  - **(c) Disable immutable releases** on the repository, so `publish-windows` can `gh release upload` after the Linux
    publish. This drops the REL-02 immutability guarantee and the `immutable-releases.json` repo control.
- **Proposed Windows asset names (all options):** `powerbrowser-<version>.windows-x86_64.installer.exe`,
  `powerbrowser-windows-x86_64.installer.exe`, `powerbrowser-<version>.windows-x86_64.complete.mar` and
  `powerbrowser-windows-x86_64.complete.mar`, following the generation rule in `docs/RELEASING.md` "Release asset
  names".

## 54-02 must_haves that are NOT met (review WR-09; the gate for plan 54-04)

Plan 54-02 landed only the uninstall-ping `Return` in patch 040, the Windows stage script and the PE32+ natives
gate. These must_haves stay open until items 2 to 5 above are resolved by the owner; nothing is weakened to
close them:

- ~~the fork registry namespace in patch 040 (`Software\PowerBrowser`), item 2;~~ Landed by 54-07 (040 and 045), with the compiled-reader residue listed in item 2;
- the fork installer artwork, item 3;
- the LEG-01 trademark-surface extension compared as set equality in both directions, item 4;
- the widened `installer-schema` and `installer-build-proof` rows, item 5;
- ~~the uninstall survey URL (`uninstaller.nsi` `URLUninstallSurvey`) still opens an upstream host, item 2.~~ Removed by 54-08.
