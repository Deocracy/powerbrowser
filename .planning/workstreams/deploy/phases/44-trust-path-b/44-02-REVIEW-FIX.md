---
phase: 44-trust-path-b
fixed_at: 2026-10-31T00:00:00Z
review_path: .planning/workstreams/deploy/phases/44-trust-path-b/44-02-REVIEW.md
iteration: 1
findings_in_scope: 6
fixed: 6
skipped: 0
status: all_fixed
---

# Phase 44 Plan 02: Code Review Fix Report

**Source review:** 44-02-REVIEW.md. **Scope:** WR-01..WR-06 (required), IN-01..IN-03 (cheap ones).
**Verification ran in:** the main checkout (no worktree). Before every commit `scripts/verify-platform.sh --quick`
ended `verify-platform: PASS`, with `node scripts/build-update-xml.mjs --self-test` and
`node scripts/verify-mar-update-hop.mjs --self-test` green. The final `--quick` run is on the IN-02 tree.

## Fixed Issues

| Finding | Outcome | Commit |
|---------|---------|--------|
| WR-02 | fixed | 5a2debcc |
| WR-01 | fixed (also covers IN-02 hop half, IN-03) | e2ff00ef |
| WR-03 | fixed | bcab2156 |
| WR-04 | fixed | 1ec48a16 |
| WR-05 | fixed | 42d73322 |
| WR-06 | fixed | b79d99a3 |
| IN-02 | fixed (builder half; hop half is in e2ff00ef) | 99d74b5b |
| IN-03 | fixed | e2ff00ef |
| IN-01 | skipped (see below) | - |

### WR-02: symlinked DIRECT_RUN
`scripts/verify-mar-update-hop.mjs`: `realpathSync` on both sides (generate.mjs `isEntryPoint()` pattern); `INVOKED_DIRECTLY` folded into `DIRECT_RUN`. Self-test plants a symlinked invocation with an unknown flag and requires exit 2 (confirmed red with the old comparison restored).

### WR-01: hop gate and detailsURL
`scripts/verify-mar-update-hop.mjs`, `docs/BUILD.md`. The expected detailsURL is `hop.detailsURL`, else `[urls] release_notes` only when the served descriptor carries the attribute, so pre-UPD-14 evidence and the unchanged BUILD.md procedure stay valid. The served attribute is compared with the expectation by parse-back, independently of the emitter. The byte-difference message no longer blames "a hand edit" alone. Header comment and BUILD.md state the revised claim. Self-test: no-attribute descriptor green; dropped, differing and tab-bearing detailsURL red. (The 44-02 SUMMARY does not repeat the "stays byte-identical" claim, so it is unchanged.)

### WR-03: patch URL asset name
`scripts/build-update-xml.mjs`. The URL names `<app_basename>-<tag minus v>.<target token>.complete.mar`, the `versioned-mar` name `verify-release-asset-set.mjs` lists. The token comes from `scripts/lib/channel-identity.mjs targetTokenOf` over `docs/RELEASING.md`, the same table that script reads (that script exits at import, so the helper library is the reusable source). Self-test compares the URL with that script's own `--expected` output, with a differently named local MAR, and plants a docs file with no table.

### WR-04: tag versus Version
Refuses when the `release.txt` tag's ESR version differs from `application.ini` Version, naming both files and values. Plant: `v153.6.0-1`.

### WR-05: platformVersion
Reads `[Gecko] MaxVersion`, refuses its absence naming `application.ini`, compares it on parse-back, shortcut comment removed. Self-test: older MaxVersion reaches platformVersion; plant with no MaxVersion.

### WR-06: fail-closed plants
Plants for absent config.status, application.ini, MAR and release.txt; malformed tag; pending OS Darwin and WINNT; unset `mar_origin` (separate fixture root). Each must name file and value, and a red input must emit nothing.

### IN-02 and IN-03
Shared `isCleanHttpsUrl` (exported from the hop gate, used by both) refuses whitespace and control characters; plants in both self-tests. IN-03 is the dropped-detailsURL plant plus the independent parse-back comparison.

## Skipped Issues

### IN-01: byte-identity and parse-back checks are largely tautological
**Reason:** not cheap. The one independent comparison is against a tracked descriptor tree, which does not exist before Phase 49; the full-tier row comment already states the limit. Revisit when that tree lands.

## Notes

- `scripts/verify-descriptor-monotonic.mjs` (44-03) was not edited. Its `--self-test` still passes against the changed hop gate exports.
- `scripts/verify-release-asset-set.mjs` was not edited.
- `build-update-xml --check` on the real tree still fails only on the absent `.mozbuild/mar-hop/nplus1.mar` (by design until an N-plus-1 MAR exists); with a stand-in `--mar` it passes, so the tag/Version, MaxVersion and docs-token checks accept the real objdir.

---

_Fixer: Claude (gsd-code-fixer)_
_Iteration: 1_
