---
phase: 46-in-app-update-experience-and-egress-pass-c
plan: 05
subsystem: updates
gap_closure: true
status: complete
tags: [UPD-24, G2, mar-hop]
key-files:
  created:
    - scripts/drive-mar-update-hop.mjs
  modified:
    - scripts/verify-mar-update-hop.mjs
    - scripts/verify-platform.sh
    - docs/BUILD.md
commits: [9a88afeb, dcaa0bcb]
---

# 46-05 Summary: WebDriver hop driver (G-46, 46-VERIFICATION G2)

`scripts/drive-mar-update-hop.mjs` runs the N to N+1 hop and writes the evidence the
`mar-update-hop` row reads. It serves `update.xml` (emitted by the verifier's `buildUpdateXml`)
and the signed MAR on a free loopback port and stages a copy of N with the loopback
`AppUpdateURL` policy. It then makes three BiDi launches, with the shell's stdout captured to
`client-update.log`:

1. N: opens a marker web tab, records the layout, waits for the notification carrying the
   contracted Restart now button, records its DOM text and clicks it. It then polls the staged
   `application.ini` for N+1. The restarted instance is found by its `--profile` argument in
   `/proc` and stopped with SIGTERM.
2. The same profile again: reads `Services.appinfo` version and appBuildID and the layout.
3. A read-only copy of N: records the notification carrying Open download page and whether
   any Restart now notification appeared.

The transcript fields now come from what the driver observed. hop.json no longer carries
self-reported values. `runChecks` is exported from the verifier, with no behaviour change, so
the driver ends by judging its own evidence.

Registry: one `--quick` row, `mar-hop-driver-self-test`. The self-test sends fixture
observations through the live run's `composeHop`/`writeEvidence` into the verifier's
`runChecks`. The control case passes. Seven observation plants each fail on their own field:
ready text naming N, no notification, no click, relaunch on N, marker tab lost, no ini flip, and
a read-only ready string. Three version-guard plants also fail, as does a run with no
arguments.

## Verification

- `node scripts/drive-mar-update-hop.mjs --self-test`: PASS.
- `node scripts/verify-mar-update-hop.mjs --self-test`: PASS.
- `--quick`: green except the known reds (permission-prompts, permission-prompts-self-test,
  fixer-isolate-self-test). scan-brand-residue PASS with the new file staged.
- Live smoke on `objdir/dist/bin/powerbrowser` (153.5.1, build 20261103143743), headless: the
  marker tab appears in the layout fingerprint, the notification DOM read returns text plus
  `data-action` labels for a MessageService info with Restart now/Later, and the chrome-context
  `Services.appinfo` read works. The full hop has not run because no N+1 build exists. 46-06
  documents that run for Stage F.
- The driver refuses `--n objdir/dist/bin --nplus1 objdir/dist/bin` (153.5.1 vs 153.5.1) with
  exit 1, naming `powerbrowser/packaging/version-nplus1/`.

## Deviations

- The layout fingerprint compares the left and right view containers plus the marker tab, not
  the whole main and bottom areas. The smoke run showed a terminal (`bottom:bash`) and the
  Welcome page in the layout, and neither has to come back after a restart.
- The plan said a stdout capture for every launch. Only launch 1's capture becomes
  `client-update.log`, because that run's ready event is the one the gate binds. The read-only
  capture stays in the temporary work directory.

## Open for the live run (Stage F)

- The relaunched instance gets a fixed 30 s settle before SIGTERM (`shortcut:` comment in
  `stopProfileInstances`). Raise it if layout restore is slow on legion.
- `MOZ_LOG=append,...` is used so that the relaunched process does not truncate the resolver
  log. If that build ignores `append`, `client-resolver.log` holds only the post-restart lines.
- The pre-restart layout is saved by the shell on quit. If the SIGTERM quit of the relaunched
  N+1 instance does not save the layout, the marker check reads the layout N saved, which is
  the layout under test.
