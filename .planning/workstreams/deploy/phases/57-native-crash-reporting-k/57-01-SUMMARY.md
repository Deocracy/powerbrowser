---
phase: 57-native-crash-reporting-k
plan: 01
subsystem: telemetry-crash-reporting
tags: [tel-09, glean, crash-ping, consent, patch-stack, blocked]
status: blocked
requirements: [TEL-09]
commits: 0
plan_head_before: c755d408
---

# Phase 57 Plan 01: Glean crash-ping consent gate (BLOCKED)

**Status: BLOCKED. Neither task landed. The plan's Task 1 needs an owner decision on the compiled-file guard, recorded in BLOCKED.md (B1).**

## What was attempted

- Task 1 (the hook-only consent patch, the static consent gate, and the registry rows): not landed.
- Task 2 (the reporter-enabled layer-3 assertion and its disposition plants): not landed. It depends on Task 1 (BLOCKED.md B2).

## Why the patch cannot land as planned

The plan requires a patch that flips the Glean crash-ping consent default, and requires `scripts/check-patch-surface.sh`
to stay green on it. Those two requirements conflict.

- The consent switches are Rust. `determine_telemetry_enabled` in
  `upstream/toolkit/crashreporter/client/app/src/glean.rs:35-71` defaults to `true` on the four absent and unreadable
  inputs, and `send_ping.rs:24,45-56` sets `upload_enabled: true`.
- `scripts/check-patch-surface.sh:23` lists `.rs` in `COMPILED_SUFFIXES`, and the scan rejects any patch that
  targets such a path. Every route that makes the patch pass the guard either weakens the guard or generates the
  Rust under a non-`.rs` name, which defeats the guard's purpose (D-72/D-73).
- The build-config files (`moz.configure`, `moz.build`, `.mk`) do not reach the runtime default, so no
  hook-only patch can be fail-closed.

The guard was not modified, and no `.rs` path was added to any patch. The patch stack is unchanged:
`scripts/regenerate-patches.sh --check` passed with 4 patches before and after this plan.

## Verification in this run

- `scripts/regenerate-patches.sh --check`: PASS, 4 patches (010, 020, 030, 040), before any change.
- `scripts/verify-platform.sh --quick` on the tree at the end of this plan's work: PASS (see the final report).

## Derived host (recorded for the owner)

`upstream/toolkit/crashreporter/crashping/src/lib.rs:22` gives `TELEMETRY_SERVER = "https://incoming.telemetry.mozilla.org"`.
The gate that would derive it at check time is not landed.

## Owner-run layer-3 command

Not executed, and not in the agent shell. The command and its output are recorded only after B1 lands and a
reporter-enabled build exists (BLOCKED.md B2).

## Consequence for later plans

`--disable-crashreporter` stays in every committed build. TEL-09 has no binary-side fix yet. Plan 57-04 (TEL-13) must
not run until B1 is resolved.
