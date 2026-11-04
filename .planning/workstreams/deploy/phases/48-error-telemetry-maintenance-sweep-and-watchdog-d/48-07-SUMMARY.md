---
phase: 48-error-telemetry-maintenance-sweep-and-watchdog-d
plan: 07
subsystem: telemetry
tags: [tel-06, tel-03, in-04, gap-closure]
gap_closure: true
status: complete
requires:
  - phase: 48-01
    provides: the [telemetry] endpoint in the defaults layer
provides:
  - toolkit.telemetry.server blank at every telemetry level
  - verify-telemetry check 5 over every level the sender implements
requirements-completed: []
---

# 48-07 SUMMARY: Gecko telemetry server pref stays blank (IN-04)

## What changed

- `scripts/generate.mjs`: `mozillaEndpointPrefs` emits `toolkit.telemetry.server` as `""` at
  every level (the level is still validated). The emitted pref-file comment, the doc comment and
  the `endpointHostsControl` level-all expectation are updated; the self-test case is renamed
  `manifest endpoint hosts derive the stated hosts and the endpoint prefs`.
- `powerbrowser/branding/{dev,release}/pref/firefox-branding.js`: regenerated comment lines
  (the pref value was already blank, since the manifest level is `off`).
- `scripts/verify-telemetry.mjs`: check 5 asserts the blank at the manifest level and at each
  level in the sender's exported `TELEMETRY_LEVELS`.

## Commits

- 06f51b05 docs(48-07): plan
- b4c90402 fix(48-07): blank server pref at every level
- 0e7466a0 test(48-07): check 5 over every level

## Verification

- `node scripts/generate.mjs --check`: PASS (70 files). `--self-test`: PASS (71 plants).
- `node scripts/verify-telemetry.mjs` and `--self-test`: PASS.
- A temporary restore of the repoint turned check 5 red (`at level crash derives
  toolkit.telemetry.server "https://events.powerbrowser.org/events"`) and the generate self-test
  case red; the file was restored.
- `scripts/verify-platform.sh --quick`: green except the known `fixer-isolate-self-test` red.
