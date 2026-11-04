---
phase: 54-windows-h
plan: 07
gap_closure: true
gap: G-54c part 1 (registry root move, R3, BLOCKED.md item 2)
status: complete
requirements: [PKG-12]
key-files:
  created: [patches/045-powerbrowser-registry-root.patch]
  modified: [patches/040-powerbrowser-nsis.patch, scripts/verify-win-matrix-record.mjs, docs/BUILD.md, .planning/workstreams/deploy/phases/54-windows-h/BLOCKED.md]
commits: [1a4ee818]
---

# 54-07 summary: installer registry keys move to Software\${BrandShortName}

- Patch 040 defines `AppRegRoot` as `Software\${BrandShortName}` (`@MOZ_APP_DISPLAYNAME@`, so `Software\PowerBrowser`
  in the release branding). No patch line carries a brand literal.
- New patch 045 moves every key whose readers are NSIS or chrome JS: the root, the `${BrandFullNameInternal}` install
  keys, `${AppName}\Installer`, `${AppName}\32to64DidMigrate` and `Uninstalled-<channel>`, plus the readers
  `UpdateService.sys.mjs` and `BrowserGlue.sys.mjs` (root from `AppConstants.MOZ_APP_DISPLAYNAME_DO_NOT_USE`).
- Kept under `Software\Mozilla\${AppName}` because compiled files read them and check-patch-surface refuses compiled
  paths: `TaskBarIDs`, the launcher subkey, `MaintenanceService`. `NativeMessagingHosts` stays (a third-party path).
- Procedure: edited the applied `upstream/`, staged it, seeded 045's headers, ran `regenerate-patches.sh`. A sparse
  scratch clone replayed with `apply-patches.sh --upstream` matched `upstream/`'s index on all 29 patched paths.
  `git -C upstream diff` is empty.
- Checks: `patches-regenerated`, `check-patch-surface`, `apply-patches --self-test`, `installer-build-proof`, a
  makensis compile of `uninstaller.nsi`, `win-matrix-record --self-test` (23 plants, 4 new), `ext-tab-host-patch-guards`
  (045 listed in BUILD.md), and `--quick` (only the known `fixer-isolate-self-test` red).
