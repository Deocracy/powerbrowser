---
phase: 54-windows-h
plan: 08
gap_closure: true
gap: G-54c part 2 (uninstall survey removal, R3)
status: complete
requirements: [PKG-12]
key-files:
  modified: [patches/040-powerbrowser-nsis.patch, .planning/workstreams/deploy/phases/54-windows-h/BLOCKED.md]
commits: [bf9fb53b]
---

# 54-08 summary: the uninstall survey is gone

- Patch 040 (regenerated) deletes `URLUninstallSurvey`, the finish-page survey checkbox, `un.Survey`,
  `$ShouldOpenSurvey` and the `un.onGUIEnd` branch that opened the survey host.
- `installer-build-proof` and a makensis compile of `uninstaller.nsi` pass. `--quick` shows only the known red.
- Left unchanged: the installer's `CustomAbort` survey, which runs only for a Funnelcake `distribution.ini`.
