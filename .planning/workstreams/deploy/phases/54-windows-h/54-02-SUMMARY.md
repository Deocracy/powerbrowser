---
phase: 54-windows-h
plan: 02
subsystem: packaging
status: partial
tags: [windows, nsis, patch-regeneration, leg-01, package-natives]
requires:
  - phase: 54-01
    provides: win32-x64 pin, build-windows job, windows-mozconfig and node-runtime rows
provides:
  - patch 040 regenerated with the uninstall-ping Return (both call sites reach it)
  - Windows stage script powerbrowser/packaging/package-windows.sh
  - PE32+ x86-64 header check and node.exe / rg.exe coverage in the natives gate
affects: [54-03, 54-04, phase-50 release pipeline]
key-files:
  created:
    - powerbrowser/packaging/package-windows.sh
  modified:
    - patches/040-powerbrowser-nsis.patch
    - scripts/verify-package-target-natives.mjs
    - docs/RELEASING.md
decisions:
  - "Patch 040 is regenerated from upstream/ with the script's own git options over the three NSIS paths; the new uninstaller.nsi section is added to the patch's own path list by that regeneration, then --check verifies it"
  - "The upstream change is staged in upstream's index (git -C upstream add) so the upstream worktree equals its index, the invariant the strip-spike row checks; apply-patches stages the same way"
  - "LEG-01 and the namespace move are blocked, not narrowed: a strict surface comparison is red on the current tree until the owner decides the registry namespace and the artwork"
  - "The win64 native check reads the full PE32+ header, not the MZ bytes alone, and accepts the Windows binary names node.exe and rg.exe"
metrics:
  duration: "one session"
  completed: 2026-10-31
  tasks: 3
  files: 4
actuals:
  tokens: 4290
  tasks: 3
  commits: 2
  basis: chars/4 over the realized diff e1cb7f72..HEAD excluding the upstream tree (17160 bytes); the plan estimate was 110000 over the full work
---

# Phase 54 Plan 02: Windows packaging surfaces Summary

**Uninstall ping removed by regenerating patch 040, a Windows stage script with a hosted-artifact hash check, and a PE32+ native gate. The namespace move, artwork and LEG-01 extension are blocked on owner decisions (see BLOCKED.md).**

## Status

Partial. Task 1 is partly done, Task 2 is blocked, Task 3 is done except the natives full-tier row. The `--quick` tier is green.

## Commits

Plan head before: `e1cb7f72`. Measured with `git rev-list --count e1cb7f72..HEAD` at the time of this summary: 2.

- `3e1f134b` feat(54): Windows stage script and PE32+ native gate (PKG-13 assembly)
- `12b3194f` feat(54): uninstall ping removed by regenerating patch 040 (PKG-12 part)

## Verification

- `scripts/verify-platform.sh --quick`: exit 0, `verify-platform: PASS -- all checks passed`, 216 PASS rows, no FAIL row. Plan 02 added no registry rows, so the count matches plan 01.
- `scripts/regenerate-patches.sh --check`: PASS, 4 patches equal their regeneration from upstream/.
- `--only patches-regenerated`, `patches-regenerated-self-test`, `installer-schema`, `installer-schema-self-test`, `installer-build-proof`: each exit 0. `installer-build-proof` compiled `installer.nsi` with `makensis`.
- `scripts/verify-package-target-natives.mjs --self-test`: exit 0. The synthetic PE32+ x86-64 Windows stage is green; a Mach-O binary and a magic-only MZ are each red naming the file.
- `scripts/verify-strip-spike-verdict.mjs`: exit 0 after the upstream index was staged (see deviation 2).
- `node scripts/scan-brand-residue.mjs`: PASS over 485 files.

### Regeneration output

The 040 candidate was generated with `scripts/regenerate-patches.sh`'s git options over the three NSIS paths. Its only difference from the previous 040 is the added `uninstaller.nsi` section, 12 lines:

```text
@@ -328,6 +328,7 @@ Function un.OpenRefreshHelpURL
 Function un.SendUninstallPing
+  Return ; no uninstall ping is sent (non-GUI NG-066); both call sites reach this Return
```

## Task status

### Task 1: regenerate 040 (PARTIAL)

- **Done:** uninstall ping removal. `un.SendUninstallPing` returns first. Both `Call un.SendUninstallPing` sites (`uninstaller.nsi:996` and `:1142`) reach it. This mirrors the install-ping skip already in 040.
- **Blocked (BLOCKED.md item 2):** the `Software\Mozilla` to `Software\PowerBrowser` move. Application readers in files outside 040 use the same keys: `WindowsInstallsInfo.sys.mjs:56`, `NativeManifests.sys.mjs:25`, `BrowserGlue.sys.mjs:839-844`. An installer-only move would split installer and app.
- **Blocked (BLOCKED.md item 3):** the wizard bitmaps and the `firefox64.ico` replacement. `brand/` holds only `mark.svg`. A new brand file needs a signed human review.
- **Deferred (BLOCKED.md item 5):** widening `installer-schema` and `installer-build-proof` to assert the fork root and the dead ping. The ping is covered by `patches-regenerated`; the registry assertion waits on item 2.
- **Not in plan, recorded:** the uninstall survey URL at `uninstaller.nsi:153` (`URLUninstallSurvey`, a Mozilla host). It is outside the plan's list and needs the owner's decision (item 2).

### Task 2: LEG-01 trademark extension (BLOCKED)

Not implemented. The extension compares surfaces as strict set equality in both directions. On the current tree it would name the `Software\Mozilla` keys and the survey host, so it cannot go green without items 2 and 3. Weakening the comparison to pass would defeat the row. No plant was added and no exclusion was introduced. See BLOCKED.md item 4.

### Task 3: stage script and natives gate (DONE, one row deferred)

- `powerbrowser/packaging/package-windows.sh` mirrors `package-linux.sh`'s order for win64. The sidecar comes only from `PB_WIN_SIDECAR_DIR`, a hosted-artifact directory. Its `SHA256SUMS` must agree before anything is copied. The Node pin is the win32-x64 zip from `node-runtime.json`, extracted with `zipfile`. The natives gate runs before precomplete. The script never reads the legion `theia/` tree; a grep finds zero `ROOT/theia` references.
- `scripts/verify-package-target-natives.mjs`: the win64 target checks the full PE32+ header. Two pre-existing defects are fixed: the `--stage` argument was rejected by the argument loop, and `node.exe` and `rg.exe` were never matched as natives.
- **Deferred:** a full-tier `package-target-natives` row for win64. The existing full row checks the Linux tarball only and needs the built package. A win64 full row would need a built Windows stage, which is the owner's live run (BLOCKED.md item 8).

## Deviations from Plan

### Adaptations

**1. [Adaptation - regeneration path] The 040 section was produced from git, then verified by `--check`.** `regenerate-patches.sh` regenerates only the paths a patch already names. `uninstaller.nsi` was new to 040, so its section was produced by git's diff with the script's exact options over the three paths, then verified by `--check` (4 patches green). The patch content is git output, not a hand-typed hunk.

**2. [Adaptation - upstream invariant] The upstream change is staged in upstream's index.** The first edit left the upstream worktree unequal to its index, which `verify-strip-spike-verdict` reports as a Gecko change outside the patch stack. `git -C upstream add` on the one NSIS file brings the worktree to its index, the state `apply-patches.sh` leaves. The HEAD-based regeneration is unchanged. Re-running `apply-patches.sh` over the patched index would conflict, and a reset of upstream would discard the staged stack, so neither was used.

**3. [Adaptation - natives row] No new full-tier win64 row.** The existing `package-target-natives` row is linux-only; its full run needs the built Linux tarball. The win64 self-test is part of the existing quick self-test row, and the live win64 stage check is the owner's run.

**4. [Adaptation - Task 3 shape] `package-windows.sh` stages and gates; repackage runs in the workflow.** The plan had the script run the installer and MAR repackage too. The build-windows job already runs `mach repackage` after the stage, so the script stops at the native gate and precomplete, to avoid running the repackage twice.

### Auto-fixed issues

**1. [Rule 1 - Bug] `verify-package-target-natives.mjs` rejected `--stage`.** The argument loop had no branch for `--stage`, so the documented stage override exited 2. Fixed by consuming its value in the loop.

**2. [Rule 1 - Bug] `isNativeName` missed `node.exe` and `rg.exe`.** A Windows stage's real binaries would never have been checked. Fixed by matching both names.

### Authentication gates

None.

## Known Stubs

None in the shipped files. The blocked items are tracked in BLOCKED.md, not stubbed.

## Self-Check: PASSED

- Commits `3e1f134b` and `12b3194f` are in `git log`.
- `powerbrowser/packaging/package-windows.sh` and `patches/040-powerbrowser-nsis.patch` are tracked.
- `--quick` exit 0 with 216 PASS rows and no FAIL row.
