---
phase: 48-error-telemetry-maintenance-sweep-and-watchdog-d
plan: 06
subsystem: telemetry
tags: [tel-06, in-03, gap-closure]
gap_closure: true
status: complete
requires:
  - phase: 48-01
    provides: admittedErrorData and EVENT_NAME in telemetry-enrichment.ts
provides:
  - the usage path (sendEventData) filtered like the error path
  - verify-telemetry --self-test usage-path control and two plants
requirements-completed: []
---

# 48-06 SUMMARY: admitted-key filter on the usage path (IN-03)

## What changed

- `theia/extensions/telemetry/src/browser/telemetry-sender.ts`: `sendEventData` runs
  `admittedErrorData(data)` (drops on `null`) and sends a name that fails `EVENT_NAME` as
  `unknown`. Level semantics and the TEL-06 preference text are unchanged.
- `scripts/verify-telemetry.mjs`: `driveUsage(root)` drives a real sender at level `all` with a
  control event, non-admitted keys, a path-shaped name and content in an admitted key. The
  self-test runs it as a green control, then plants the data unfiltered and the name unfiltered;
  each goes red naming `usage path`. Self-test count 8 to 10.

## Commits

- 4c1bf629 docs(48-06): plan
- ff5cdbcc fix(48-06): filter the usage path
- 7bf589f8 test(48-06): self-test control and two plants

## Verification

- `node theia/extensions/telemetry/test/telemetry-sender.test.mjs`: 9/9 green.
- `node scripts/verify-telemetry.mjs`: PASS. `--self-test`: PASS, 10 planted faults.
- `scripts/verify-platform.sh --quick`: green except the known `fixer-isolate-self-test` red.

## Not verified

- No frontend rebuild or live run; the 48-05 C11 loopback drill exercises the error path only.
