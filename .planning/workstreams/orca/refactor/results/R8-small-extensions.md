# Result: R8-small-extensions

Branch: worktree-agent-a130b26625febf4b9   Base: 08e6f64393f5cc8e54319341079da22657e99bd2   Final: the commit that updates this record after review (its parent is 02a8c976)

| # | Type | Commit | Files | What and why it is safe |
|---|---|---|---|---|
| 1 | refactor | f330df77 | theia/extensions/telemetry/src/browser/telemetry-preferences.ts | Removes the `TelemetryPreferences` proxy binding, `createTelemetryPreferences` and `TelemetryConfiguration`. The token is a non-global `Symbol` that nothing in the tree injects or gets (`git grep -w`), so the lazy singleton was never constructed. The sender still reads the level through `PreferenceService`. The checks that parse this file (telemetry, first-boot-surface, ng-067) read only the key, description, default and enumDescriptions, and none of those changed. |
| 2 | perf | f16167a7 | worker/crash-submit.mjs | `indexOfBytes` takes its candidates from the native `Uint8Array#indexOf(needle[0])` and compares bytes only at those positions. It is on the hot path because every POST /submit scans up to 20 MiB on a runtime that limits CPU time. It is about 5-8x faster on a 20 MiB random body. A fuzz of 200k cases found the same result as the old loop for every non-empty needle, and all three callers pass a needle of at least 4 bytes. `verify-worker-submit` and `--self-test` pass, and none of the self-test's plant strings sit inside this function. Review found its worst case slower than the base loop; see row 3. |
| 3 | fix | 02a8c976 | worker/crash-submit.mjs | Fixes the worst case of row 2, which review found. The delimiter's first byte is always 0x0D, so a body of all 0x0D bytes made one native call per byte and ran about 6x slower than the base loop. A candidate byte is now compared inline, and only after 16 non-candidate bytes does the native `indexOf` skip ahead. A 400k-case differential fuzz against the base loop found no difference, including subarray views with a non-zero byteOffset and `from` past the end. `verify-worker-submit` and `--self-test` pass. |

Delimiter-scan timings: median of 5 full split scans on node 24, as base / f16167a7 / 02a8c976.

| Body | Base | f16167a7 | 02a8c976 |
|---|---|---|---|
| 20 MiB random | 39.1 ms | 6.9 ms | 7.4-8.9 ms |
| 20 MiB all 0x0D (worst case) | 56.6-57.6 ms | 343.6-364.9 ms | 52.6-54.3 ms |
| 20 MiB repeated CRLF | 57.3-57.4 ms | 184.0-350.2 ms | 47.4-52.2 ms |
| 8.3 MiB multipart crash body (extra, MDMP minidump, memory_report) | 16.2-17.4 ms | 2.8-2.9 ms | 3.0 ms |

## Bugs fixed
- worker/crash-submit.mjs `indexOfBytes` at f16167a7 (a bug this lane introduced, not one present at base): an all-0x0D body ran about 6x slower than the base loop. Fixed in 02a8c976. no-check: a timing assertion would be flaky on a shared host, so the record carries the measured numbers instead.

## Registry requests
None.

## Red by design
None.

## Blocked by check
None.

## Handoffs
None.

## Needs owner
None.

## Not done
- token-gate `gate()`/`allowWsUpgrade()` call `isTokenValid` again on a value `getTokenFromCookie` already validated. This is a second constant-time compare per request. The brief fixes what is checked and in what order, so it stays.
- events-worker `handleEvents` calls `env.DB.prepare(INSERT_EVENT)` once per row, at most 100 per POST. Preparing once and binding per row depends on D1's `bind` returning a new statement, which the gate's stub does not prove, and the gain is a constant factor.
- events-worker `runRetention` runs its two DELETEs in sequence. It is a daily job, and running them in parallel would change what happens when the first DELETE fails.
- The branding getters call `readBrandingConfig()` several times per render. The about dialog and the welcome widget render rarely, so this is a constant factor on a cold path.
- The reinstall-command `refresh()` and the customize-css `applyCss()` reads can resolve out of order. Both are low-impact edge cases at startup only, with no observed effect, so neither is reported as a bug.
- The `ErrorReporter.admitted` set has no upper bound. Its "ponytail" comment already records this as a known decision.

## Quick gate
`scripts/verify-platform.sh --quick` inside `nix develop .#theia`, run at f16167a7: 456 PASS, 0 FAIL, 0 SKIP (verify-platform: PASS -- all checks passed). After 02a8c976, which changes only worker/crash-submit.mjs, `verify-worker-submit`, its `--self-test` and `scan-brand-residue` were re-run and pass. The coordinator did not ask for a full re-run.
