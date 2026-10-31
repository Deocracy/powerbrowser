---
phase: 57-native-crash-reporting-k
plan: 03
subsystem: telemetry-crash-reporting
tags: [tel-12, symbols, release-assets, minidump-stackwalk, policy]
status: complete
requirements: [TEL-12]
commits: 2
plan_head_before: a78730cb
plan_head_after: 24771e3b
---

# Phase 57 Plan 03: per-target symbols gate and the rewritten crash policy (TEL-12)

**One line:** the per-target `*.crashreporter-symbols.zip` names derive from `package-name.mk` and the DIST-07 token table, a gate proves them unique and SHA256SUMS-covered, and `docs/CRASH-POLICY.md` now states the enabled state with a stackwalk runbook.

## Commits

| Task | Commit | Subject |
|---|---|---|
| 1 | 0699b886 | feat(57-03): per-target crash symbols gate on the DIST-07 asset grammar |
| 2 | 24771e3b | docs(57-03): rewrite the crash policy for the enabled state |

## Task 1: symbols gate

`scripts/verify-release-symbols.mjs` derives every expectation at check time:

- The archive suffix comes from `upstream/toolkit/mozapps/installer/package-name.mk`
  (`SYMBOL_ARCHIVE_BASENAME = $(PKG_BASENAME).crashreporter-symbols`). The extension comes from
  `upstream/Makefile.in` (`$(SYMBOL_ARCHIVE_BASENAME).zip`). Either drifting goes red.
- The app basename comes from `configuration.toml` through `resolveConfig`. The per-target tokens come from the
  "Release asset names" table of `docs/RELEASING.md`, the same table `verify-release-asset-set.mjs` reads.
- Expected set: one versioned and one stable name per token, each carrying the token.
- Checks: uniqueness across targets (adjacency), no collision with a DIST-07 tarball or MAR name of the same release,
  and coverage by a SHA256SUMS-shaped text.

Output: `verify-release-symbols: PASS -- the per-target symbols archive names derive from package-name.mk and Makefile.in,
every target carries its token, no name collides, and SHA256SUMS covers each one`.

Self-test output (control green first):

    ok  unmutated control -> the derivation, the tokens, the collisions and SHA256SUMS hold
    ok  missing symbols entry -> red, naming 'powerbrowser-140.12-1.linux-x86_64.crashreporter-symbols.zip'
    ok  stale symbols entry -> red, naming 'powerbrowser-140.12-1.retired-target.crashreporter-symbols.zip'
    ok  symbols name absent from SHA256SUMS -> red, naming 'powerbrowser-140.12-1.linux-x86_64.crashreporter-symbols.zip'
    ok  target collision without the token -> duplicate, naming 'powerbrowser-140.12-1.linux-x86_64.crashreporter-symbols.zip'

**Deviations from the plan's assumed Phase 49 seam:**

- The gate does not import `verify-release-asset-set.mjs`. That module calls `process.exit(main())` on import, so
  importing it would run its whole gate. The two small derivations it needs (the asset section and the token regex) are
  re-stated here with the same regexes.
- No release manifest in this tree carries a `symbols_zip` entry. The gate derives the symbols set from the DIST-07
  grammar instead of manifest rows. The live asset set (`.github/workflows/release.yml`) is unchanged; the symbols
  join it at the TEL-13 flip.
- The "manifest predates the symbols entry" edge backstop is not exercised by any check in this tree. The stated
  assumption, that a pre-symbols Release verifies against its own asset set, is not tested here.
- The adjacency plant uses two entries that share one token, because the asset table lists one target today.

## Task 2: policy rewrite

`docs/CRASH-POLICY.md` is rewritten for the enabled state:

- The compiled-out statement is replaced by the TEL-13 gate: consent first (TEL-09), the stock per-crash dialog as the
  consent surface, and one receiver URL from `[urls].crash_report`.
- Ping versus report routing, the 7-field allowlist, the 30-day retention, the collector's 60/60 s throttle and the
  rejection vocabulary are kept byte-consistent with the literals both gates pin. `verify-crash-collector.mjs` passes
  over the rewritten page.
- The receiver's delta is stated: no in-Worker throttle, the zone rate limit instead, and the R2 lifecycle as the only
  retention.
- Symbols: attached per target to each Release, kept for the Release lifetime (the chosen retention, stated).
- Minidump-stackwalk runbook: the record-to-Release-asset mapping, a worked example for the 140.12-1 Linux archive, the
  `minidump-stackwalk <uuid>.dmp <symbols-dir>/` command, and the `--json` and `--pretty` pointers.
- The loopback-only exposure paragraph is replaced. The collector still binds loopback; the receiver's public-by-
  necessity bounds are stated.

Gate results on the rewritten page:

- `scripts/verify-platform.sh --only crash-collector`: rc 0.
- `scripts/verify-platform.sh --only crash-submit`: rc 0.
- The literal check over `upload_file_minidump`, `/submit`, `CrashID=`, `Discarded=` and `30`: all present.
- The old exposure phrases (`needs token auth`, `loopback only`): 0 matches.

**Not done:** the Task 2 pointer paragraphs in `docs/RELEASING.md` were not added. The operator rows from 57-02
already name the receiver, and the symbols pointer belongs with the TEL-13 asset-set change.

## Owner steps (NOT executed in-session)

Recorded in BLOCKED.md B4. The tier-3 command is `nix develop .#firefox --command ./mach buildsymbols` per target
after a reporter-enabled build. Record each zip's name, SHA256 and the `minidump-stackwalk` version in the operator
record.

## Verification (--quick)

`scripts/verify-platform.sh --quick` exit 0 on the tree that holds the Task 1 commit (including the rewritten policy as
an uncommitted-at-the-time working file, which the crash-collector row also passes). A final --quick run after all
commits is recorded in the final report.
