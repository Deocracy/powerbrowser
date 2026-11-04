---
phase: 57-native-crash-reporting-k
plan: 01
subsystem: telemetry-crash-reporting
tags: [tel-09, glean, crash-ping, consent, patch-stack, partial]
status: partial
requirements: [TEL-09]
requires: []
provides:
  - "patches/055-powerbrowser-crash-ping-consent.patch: the Glean crash-ping consent read fails closed"
  - "scripts/verify-crash-ping-consent.mjs: static consent gate with --self-test"
affects: [57-04]
tech-stack:
  added: []
  patterns: ["exact-path compiled-file exception in check-patch-surface.sh (ALLOWED_COMPILED_PATHS)"]
key-files:
  created:
    - patches/055-powerbrowser-crash-ping-consent.patch
    - scripts/verify-crash-ping-consent.mjs
  modified:
    - scripts/check-patch-surface.sh
    - scripts/verify-platform.sh
    - docs/BUILD.md
    - docs/RELEASING.md
    - .planning/workstreams/deploy/STATE.md
decisions:
  - "D-72/D-73 amended 2026-10-31 (owner ruling on B1, option (a)): check-patch-surface.sh accepts a compiled target only at the exact paths glean.rs and send_ping.rs under toolkit/crashreporter/client/app/src/"
  - "send_ping.rs is not patched: --send-ping runs only behind CrashManager's in-process uploadEnabled check, and --ping-cleanup takes the value as an argument"
  - "The fail-closed default is a literal false in the patch, not a generated switch: it does not vary per rebrand, and a switch would be a fail-open knob"
estimate:
  tokens: 90000
  tasks: 2
actuals:
  tokens: 6120
  tasks: 1
  commits: 2
plan_head_before: 9c777bc0deb5e38715a0f60a2337fa0707202ee7
plan_head_after: f02ada506849e7e24bd6125fff6e5fdf4c552b66
completed: 2026-10-31
---

# Phase 57 Plan 01: Glean crash-ping consent gate Summary

**The native crash reporter's `determine_telemetry_enabled` now returns false on all four absent or unreadable consent inputs, through a regenerated patch 055 under an exact-path exception to the compiled-file guard. A static gate with seven self-test plants checks it. Task 2, the live layer-3 proof, is still an owner step.**

## Status

- Task 1 (patch, static gate, registry rows): LANDED in 1d378bef and f02ada50, after the 2026-10-31 owner ruling on BLOCKED.md B1 (option (a)).
- Task 2 (reporter-enabled layer-3 assertion with positive control): NOT LANDED. It needs a tier-3 reporter-enabled build on the owner machine (BLOCKED.md B2). It was not run from the agent shell.

## Task 1

### Commits

| Commit | Change |
| ------ | ------ |
| 1d378bef | `fix(check-patch-surface)`: `ALLOWED_COMPILED_PATHS` holds exactly `toolkit/crashreporter/client/app/src/glean.rs` and `send_ping.rs`. The `--self-test` plants are: each allowed path green; `.../src/other/glean.rs`, `crashping/src/lib.rs` and `.../src/glean.cpp` each red and named. The D-72/D-73 amendment is recorded in `docs/BUILD.md` (The compiled-file boundary) and in the deploy `STATE.md` decisions. |
| f02ada50 | `feat(57-01)`: patch 055, `scripts/verify-crash-ping-consent.mjs`, the rows `crash-ping-consent` and `crash-ping-consent-self-test` (quick array, beside the patch-surface rows), and patch 050 added to the `docs/RELEASING.md` drift list. |

### The patch

- Target: `toolkit/crashreporter/client/app/src/glean.rs` only. In `determine_telemetry_enabled`, an absent profile dir, an absent `prefs.js`, an absent pref and an unreadable `prefs.js` each return `false`. An explicit `user_pref("datareporting.healthreport.uploadEnabled", true)` still returns `true`, so the post-consent path is upstream's. The patch also adds an upstream unit test, `test_telemetry_enable_pref_fails_closed`, for the absent cases.
- Produced from a seed `diff --git` header with `scripts/regenerate-patches.sh` (write mode) over the staged upstream edit. It was never text-edited. `upstream/` was then reset to `FIREFOX_153_5_1esr_RELEASE` (6cd88e7d45) and replayed with `scripts/apply-patches.sh`: "all 5 patches applied and verified non-vacuous". `regenerate-patches.sh --check` then passed with 5 patches.
- The upstream GUI test `glean_ping` still holds. Its counter hook (`test_before_next_send`) fires whether upload is enabled or not.
- `send_ping.rs` is unchanged. Its `upload_enabled: true` is reached only through `--send-ping`, which `CrashManager.in.sys.mjs` (`_sendCrashPing`) launches only when the in-process `datareporting.healthreport.uploadEnabled` is true. That pref's branding default is false.

### The gate

`scripts/verify-crash-ping-consent.mjs` runs these checks:

- It derives the host from `TELEMETRY_SERVER` in `upstream/toolkit/crashreporter/crashping/src/lib.rs`. The current value is `incoming.telemetry.mozilla.org`.
- It runs patch 055 alone through `regenerate-patches.sh --check`.
- It requires that the applied `determine_telemetry_enabled` has no `true` literal outside comments, and that `from_config` still takes `upload_enabled` from it.
- It derives the branding variants from `powerbrowser/branding/*/` and requires each to pin `uploadEnabled` false exactly once.
- It requires the allowlist to carry the derived host once, with disposition `deny`.

Self-test (7 ok):
derivation, derivation-removed, fail-open-default, patch-missing, hand-edit, branding-default, allowlist-widening.

### Verification

- `scripts/verify-platform.sh --only crash-ping-consent` and `--only crash-ping-consent-self-test`: PASS.
- `bash scripts/check-patch-surface.sh`: PASS, 5 patches. `--self-test`: PASS (1 compiled plant + 2 allowed-green + 3 still-red + 3 brand).
- `bash scripts/regenerate-patches.sh --check`: PASS, 5 patches.
- `node scripts/scan-brand-residue.mjs`: PASS, with the new files staged.
- `scripts/verify-platform.sh --quick`: `verify-platform: PASS -- all checks passed`.
- The acceptance greps passed: one `05x-*consent*.patch`; `uploadEnabled", false` appears once in each branding file; `crash-ping-consent` appears twice in `verify-platform.sh`.

## Deviations from Plan

- **[Rule 2] The patch carries a literal `false`, not a generated switch.** The plan asks for the 010 hook indirection. The consent default does not vary per rebrand, and a generated switch would add a fail-open knob. The brand-value scan stays green.
- **[Rule 1] The patch comment does not name the product.** The first regeneration put the display name in an added comment line, which the brand-value scan would reject. The comment now cites TEL-09 only.
- **The self-test has two more plants than the plan lists:** `derivation-removed` (the constant gone) and `fail-open-default` (`unwrap_or(true)` on the applied tree). The caller asked for the second one.

## Not checked

- The patched Rust was not compiled or unit-tested. Doing so needs a tier-3 build, and the toolchain in `.#firefox` has no rustfmt. The edit uses the APIs the existing test uses (`MockFiles::add_dir` and `add_file` with a `&str`, which has `From<&str>`).

## Owner-run layer-3 command (Task 2)

Not executed, and not run in the agent shell. Once a reporter-enabled build exists, Task 2 adds the assertion and its positive-control twin to `scripts/verify-endpoints.sh`. The owner then records the exact `verify-endpoints.sh --layer 3` invocation and the extracted host set here, verbatim (BLOCKED.md B2).

## Consequence for later plans

`--disable-crashreporter` stays in every committed build. 57-04 (TEL-13) was not touched. It stays gated on B2, B3, B6 and the first Windows release. TEL-09 is not marked complete because its live half (Task 2) is open.

## Self-Check: PASSED

- FOUND: patches/055-powerbrowser-crash-ping-consent.patch, scripts/verify-crash-ping-consent.mjs
- FOUND: 1d378bef, f02ada50 (ancestors of HEAD)
