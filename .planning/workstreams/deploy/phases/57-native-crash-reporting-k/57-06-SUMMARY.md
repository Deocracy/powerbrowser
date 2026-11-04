---
phase: 57-native-crash-reporting-k
plan: 06
gap_closure: true
gap: G-57 part 2 (57-01 Task 2 layer-3 assertion, B2)
status: complete
requirements: [TEL-09]
key-files:
  modified: [scripts/verify-endpoints.sh, .planning/workstreams/deploy/phases/57-native-crash-reporting-k/BLOCKED.md]
commits: [fd2cb7c4, 1eab45a9]
---

# 57-06 summary: layer-3 crash-ping assertion

- `verify-endpoints.sh --layer 3 --crash-ping [--positive-control]` does the following:
  - Requires `objdir/dist/bin/crashreporter`.
  - Unsets `MOZ_CRASHREPORTER_DISABLE`, `MOZ_CRASHREPORTER_AUTO_SUBMIT`, `MOZ_AUTOMATION` and
    `MOZ_DISABLE_NONLOCAL_CONNECTIONS`. The last two clear the Glean uploader in `crashping/src/lib.rs`.
  - Sends SIGSEGV to one `-contentproc` child 10 s into the 35 s window and requires a minidump under the profile.
  - Fails if the crash-ping host resolves. The host is derived from `TELEMETRY_SERVER`.
  - The control writes `uploadEnabled` true into the fresh profile's `prefs.js` and passes only when the verdict
    names that host.
- `endpoint-dispositions-self-test` (`--quick`) adds three plants: the derived host unattended against the real
  allowlist (red, naming `incoming.telemetry.mozilla.org`), the derivation following a moved host, and the
  derivation failing when the constant is removed.
- On the current dev build, which is reporter-disabled, `--crash-ping` fails immediately at the precondition and
  launches no browser.
- The live run was NOT executed from the agent shell. The owner commands are in BLOCKED.md B2:
  `bash scripts/verify-endpoints.sh --layer 3 --crash-ping` and
  `bash scripts/verify-endpoints.sh --layer 3 --crash-ping --positive-control`.
- Limit: a main-process crash pings from the separate client binary, whose DNS MOZ_LOG cannot record. A code
  comment marks this limit as a shortcut, and only the patch-055 static gate covers that path.
- Not checked: whether the in-process crash ping uploads inside the remaining 25 s. If it does not, the control
  goes red ("consent true did NOT surface"), and the window then needs lengthening.
