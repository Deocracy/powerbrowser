# Phase 54 (Windows) BLOCKED items

Recorded by the autonomous executor for plans 54-01 to 54-03. Each item names what is blocked, why an
agent cannot complete it, and the exact owner steps. Plan 54-04 (the owner checkpoint) was not executed.

## 1. Live build-windows run (release.yml, plan 54-01 Task 3)

- **What:** the `build-windows` job has never run. Its static shape is green (`build-windows-shape`), but
  nothing has built a Windows package on legion.
- **Why blocked:** a dispatch is a write against GitHub and a build on the legion runner. Neither is
  allowed for an agent.
- **Owner steps:**
  1. Confirm the Windows sysroot tool. The job invokes `python3 /src/upstream/build/vs/get_vs.py`, the name
     `docs/RELEASING.md` gives. The pinned Gecko tree contains only `upstream/build/vs/*.yaml`. Find the
     tool the pinned tree actually uses, and correct the step in `.github/workflows/release.yml`.
  2. Confirm the `mach repackage installer` and `mach repackage mar` arguments against the pinned tree. The
     job passes no arguments.
  3. Dispatch the release workflow at the chosen SHA only after 54-04's approval gates.

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

## 3. Installer wizard artwork (plan 54-02 Task 1, PKG-12)

- **What:** the wizard bitmaps and the `firefox64.ico` stand-in are not replaced.
- **Why blocked:** `brand/` holds only `mark.svg` and `HUMAN-REVIEW.md`. The fork's installer artwork does
  not exist in the tree, and `brand/HUMAN-REVIEW.md` requires a signed human review for any new file.
- **Owner steps:** supply the installer artwork, add it under `brand/`, and re-sign the review in
  `brand/HUMAN-REVIEW.md`. Then regenerate patch 040 with the artwork hunks.

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
  4. Run `scripts/matrix/win-matrix-run.sh`. Known gaps in the driver: it does not capture the built
     `BUILD_TARGET` into the record, and it does not write the `background` cell (UPD-31). Add both before the
     record row can go green on live data.

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
- **Owner steps:** add the `windows-latest` sidecar job under Phase 50, uploading the sidecar and its
  `SHA256SUMS`, then wire the artifact into `build-windows`.
