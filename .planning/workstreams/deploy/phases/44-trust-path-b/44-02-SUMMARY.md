---
phase: 44-trust-path-b
plan: 02
subsystem: infra
tags: [update-descriptor, update-xml, UPD-14, buildUpdateXml, mar, registry, objdir]

# Dependency graph
requires:
  - phase: 40-update-channel
    provides: update-channel gate and UPDATE_CHANNEL, the single source for the descriptor's channel segment
  - phase: 08-mar-hop-gate
    provides: buildUpdateXml, the shared descriptor emitter that the hop gate and this CLI both import
provides:
  - buildUpdateXml carries an optional detailsURL attribute, emitted after buildID and returned by parseUpdateXml (null when absent)
  - scripts/build-update-xml.mjs writes one descriptor per observed BUILD_TARGET from the built tree, with --emit, --check and --self-test
  - quick registry row build-update-xml-self-test and full-tier row build-update-xml
affects: [44-03, 44-04, phase-49 first published descriptors (DIST-09), descriptor-monotonic row]

# Actuals (#2632) - chars/4 over the realized diff; pairs with the plan estimate
actuals:
  tokens: 8869
  tasks: 3
  commits: 3
plan_head_before: 4804013f72294d284d80af774e982c24e928e3a1
plan_head_after: b2ef66ee5637a441e41d9bc376e4a5ccc3f1fbab
commits: 3

# Tech tracking
tech-stack:
  added: []
  patterns:
    - one emitter imported by the hop gate and the ship-path CLI, never copied
    - inputs derived from the built tree at run time (application.ini, config.status [substs], MAR bytes, configuration.toml)
    - full-tier rows FAIL naming the missing input, never SKIP

key-files:
  created:
    - scripts/build-update-xml.mjs
  modified:
    - scripts/verify-mar-update-hop.mjs
    - scripts/verify-platform.sh

key-decisions:
  - "detailsURL defaults to [urls] release_notes from configuration.toml (currently https://github.com/Deocracy/powerbrowser/releases). The DeBIOS-Foundation literal in the plan and in 44-RESEARCH.md is stale; the config is the source. The owner should confirm the organisation."
  - "detailsURL is optional in buildUpdateXml: absent means no attribute, so descriptors emitted before UPD-14 keep their bytes."
  - "The hop gate regenerates with hop.detailsURL, falling back to [urls] release_notes, so the gate and the ship path cannot disagree."
  - "The proof MAR defaults to .mozbuild/mar-hop/nplus1.mar (the name hop.json and BUILD.md use); --mar overrides it."
  - "--check without --outdir proves determinism and parse-back from the built tree. The on-disk comparison is opt-in with --outdir, because no committed descriptor tree exists until Phase 49."
  - "platformVersion equals Version (Gecko ESR convention); recorded as a shortcut in the CLI header."

patterns-established:
  - "Pattern: one emitter, one CLI per target table; the CLI imports buildUpdateXml and carries its own flags"
  - "Pattern: planted-fault self-test with a green control and a byte-identity control, each plant red naming its file and value"

requirements-completed: []  # UPD-14 is NOT closed: the full-tier row FAILs until an N-plus-1 MAR exists. See Issues Encountered.

coverage:
  - id: D1
    description: "buildUpdateXml emits and parses back an optional detailsURL; the hop gate's idempotency assertion covers it"
    requirement: "UPD-14"
    verification:
      - kind: unit
        ref: "scripts/verify-platform.sh --only mar-update-hop-self-test"
        status: pass
    human_judgment: false
  - id: D2
    description: "scripts/build-update-xml.mjs emits one descriptor per observed BUILD_TARGET, re-emits byte-identically, and proves its five planted faults red"
    requirement: "UPD-14"
    verification:
      - kind: unit
        ref: "scripts/verify-platform.sh --only build-update-xml-self-test"
        status: pass
    human_judgment: false
  - id: D3
    description: "Full-tier proof: descriptors emitted from the built objdir/ and the N-plus-1 MAR equal a fresh emission"
    requirement: "UPD-14"
    verification:
      - kind: other
        ref: "scripts/verify-platform.sh --only build-update-xml"
        status: fail
    human_judgment: true
    rationale: "The row FAILs naming .mozbuild/mar-hop/nplus1.mar, which the packaging procedure has not produced. It goes green only after that MAR is built and a human confirms the release tag and organisation in detailsURL."

# Metrics
duration: not measured (session start time was not recorded)
completed: 2026-10-31
status: complete
---

# Phase 44 Plan 02: UPD-14 Per-Target Descriptor Builder Summary

**The UPD-14 descriptor builder landed (shared emitter with detailsURL, per-BUILD_TARGET CLI, quick self-test row) and its quick proof is green; the full-tier row FAILs by design until an N-plus-1 MAR exists, so UPD-14 stays open.**

## Performance

- **Duration:** not measured (session start time was not recorded)
- **Started:** not recorded
- **Completed:** 2026-10-31
- **Tasks:** 3 of 3 committed
- **Files modified:** 3 (1 created, 2 modified)

## Accomplishments

- `buildUpdateXml` (in `scripts/verify-mar-update-hop.mjs`) emits an optional `detailsURL` attribute on `<update>`, escaped through `xmlEscape`, after `buildID`. `parseUpdateXml` returns it, or `null` when absent.
- The hop gate's two regeneration sites and all three self-test fixture emissions carry `detailsURL` (hop.json value, falling back to `[urls] release_notes`). The gate's `mar-update-hop-self-test` passes.
- `scripts/build-update-xml.mjs` derives every input from the built tree: `application.ini` (Version, BuildID), `config.status` `[substs]` (OS_TARGET, TARGET_XPCOM_ABI, MOZ_UPDATE_CHANNEL, MAR_CHANNEL_ID), the MAR on disk, and `configuration.toml` (release_notes, mar_origin). It imports `buildUpdateXml`; it does not copy the format.
- `--check` emits twice and requires byte-identical output, parses each emission back against the built values, and with `--outdir` byte-compares files on disk. `--emit --outdir` writes `<outdir>/default/<BUILD_TARGET>/update.xml`.
- `--self-test` runs a green control, a byte-identity control, five planted faults (unknown OS token, no BuildID, ABI disagreeing with the table, MAR channel id given as the channel, non-https detailsURL) and a hand edit. Each plant goes red naming its file and value.

## Task Commits

1. **Task 1: extend buildUpdateXml with detailsURL** - `32db3520` (feat)
2. **Task 2: write scripts/build-update-xml.mjs** - `ee7efca1` (feat)
3. **Task 3: register both rows** - `b2ef66ee` (test)

**Plan metadata:** the `docs(44-02)` commit that adds this file (hash recorded in the orchestrator's log; STATE.md and ROADMAP.md are not touched here).

## Registry Rows Added

- Quick, after `update-channel-self-test`: `build-update-xml-self-test|node $REPO_ROOT/scripts/build-update-xml.mjs --self-test`
- Full, after `mar-update-hop`: `build-update-xml|node $REPO_ROOT/scripts/build-update-xml.mjs --check`

## Row Verdicts

| Row | Tier | Verdict |
| --- | --- | --- |
| build-update-xml-self-test | quick | PASS |
| build-update-xml | full | FAIL: `.mozbuild/mar-hop/nplus1.mar is absent` (never SKIP) |
| mar-update-hop-self-test | quick | PASS |
| mar-update-hop | full | FAIL, unchanged: no hop evidence under `.mozbuild/mar-hop/` (pre-existing, not caused by this plan) |
| update-channel | quick | PASS |
| `verify-platform.sh --quick` | - | PASS (`verify-platform: PASS -- all checks passed`, run before each commit) |
| `scan-brand-residue.mjs` | - | exit 0 (new file staged before the scan) |

## Emitted Descriptor Paths

- Self-test (mkdtemp, not committed): `default/Linux_x86_64-gcc3/update.xml`
- Dry emit on the real tree, scratchpad only, using a test MAR from `objdir/_tests/.../complete.mar` (not a release artifact, not committed): `default/Linux_x86_64-gcc3/update.xml`. Two runs produced identical bytes; the descriptor carried `detailsURL="https://github.com/Deocracy/powerbrowser/releases"`.
- No descriptor is written into the tree. The first published descriptors belong to Phase 49.

## Files Created/Modified

- `scripts/build-update-xml.mjs` - new: per-target descriptor CLI with `--emit`, `--check`, `--self-test`
- `scripts/verify-mar-update-hop.mjs` - detailsURL in the shared emitter, parser, gate and self-test fixtures; argv guard gated to direct runs
- `scripts/verify-platform.sh` - two registry rows

## Decisions Made

See `key-decisions` in the frontmatter. The main one is that `detailsURL` comes from `configuration.toml` `[urls] release_notes`, not from the DeBIOS-Foundation literal the plan names.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Top-level argv guard in the hop module ran on import**
- **Found during:** Task 2
- **Issue:** `verify-mar-update-hop.mjs` read `process.argv` at module load and exited 2 on any flag other than `--self-test`; `--self-test` also ran the hop self-test on import. A CLI that imports `buildUpdateXml` with `--emit` or `--outdir` would have been killed. The plan's premise that the import is side-effect-free did not hold for argv-bearing runs.
- **Fix:** the argv handling runs only on direct invocation (`DIRECT_RUN`). The import guard at the end of the file is byte-identical to before.
- **Files modified:** `scripts/verify-mar-update-hop.mjs`
- **Verification:** `node scripts/verify-mar-update-hop.mjs --self-test` PASS; the live gate still FAILs naming the missing evidence; the CLI imports cleanly.
- **Committed in:** `32db3520`

**2. [Rule 2 - Missing critical] Self-test fixtures needed detailsURL once the gate fell back to release_notes**
- **Found during:** Task 1
- **Issue:** the gate's regeneration now includes detailsURL, so the three fixture emissions without it would make the green control red.
- **Fix:** each fixture emission passes `FIXTURE_DETAILS`, read from the repository's `[urls] release_notes`.
- **Committed in:** `32db3520`

**3. [Rule 1 - Bug] Two prose mentions tripped the update-channel sweep**
- **Found during:** Task 2
- **Issue:** the sweep reads `--channel <word>` in prose as a channel name, so the comments "--channel defaults" and "--channel given" went red.
- **Fix:** reworded to "The channel flag defaults" and "channel flag given".
- **Committed in:** `ee7efca1`

### Plan acceptance not achievable as written

**4. `--only build-update-xml` exits 0 with objdir present.** It cannot here. `objdir/` holds `config.status`, `application.ini` and the signing tools, but no packaged N-plus-1 MAR. Per the plan's own rule ("never claim a full row green without its inputs"), the row FAILs naming `.mozbuild/mar-hop/nplus1.mar`. It does not print SKIP.

**5. Task 2's verify ran `--only build-update-xml-self-test` before the row was registered.** I ran `node scripts/build-update-xml.mjs --self-test` directly for Task 2 and ran the `--only` row after Task 3 registered it.

**Total deviations:** 3 auto-fixed (Rule 1, 2, 3); 2 acceptance-criteria gaps.
**Impact on plan:** the emitter, CLI and quick proof meet the plan. The full-tier proof waits on a MAR, as the plan's own fail-closed rule requires.

## Issues Encountered

- **UPD-14 remains open.** The full-tier row needs the N-plus-1 MAR from the packaging procedure in `docs/BUILD.md` at `.mozbuild/mar-hop/nplus1.mar` (or `--mar <path>`). Until then it FAILs. `requirements-completed` is empty for that reason.
- **Detail-URL organisation.** The plan and `44-RESEARCH.md` name `DeBIOS-Foundation/powerbrowser`. `configuration.toml` `[urls] release_notes` says `Deocracy/powerbrowser`. The CLI follows the config. The owner should confirm which is correct, then change the config, not the CLI.
- **Commit namespace guard.** The worktree commit protocol's allow-list (`agent-*`, `worktree-agent-*`, `worktree-wf_*`) would refuse `workspace/deploy`. The protected-branch check passed. The three task commits and this summary were made on `workspace/deploy` as the brief directed. The orchestrator should confirm that branch is the intended landing branch.
- **Broken-windows ledger not written.** `gsd_run windows append` refused: `.planning/WINDOWS.md` disagrees with its fenced JSON for rows 10, 11, 19, 22 and 23. That is pre-existing and was not touched. The unrun full-tier verify is therefore not recorded there; it should be appended once the ledger is repaired.
- **Calibration.** The plan estimate was 60000 tokens; the realized diff (35478 characters) comes to 8869 at chars/4.

## Known Stubs

None. The Darwin (stage 6) and Windows (stage 7) OS values are refused by name through `PENDING`; they are not stub rows.

## Threat Flags

None. The new `detailsURL` is validated as https in both the config path and the `--details-url` override, as T-44-08 requires.

## User Setup Required

None. The key ceremony (44-01) is not needed for this plan and was not touched. No secret material was created, guessed or stubbed. Patch 030 and the ng065 row were not touched.

## Next Phase Readiness

- Plans 44-03 and 44-04 can proceed; this plan did not change the key or patch surface.
- Full-tier UPD-14 proof: build the N-plus-1 MAR per `docs/BUILD.md`, then run `scripts/verify-platform.sh --only build-update-xml`. Confirm the detailsURL organisation first.
- Phase 49 owns the first committed descriptor tree and the `descriptor-monotonic` row.

## Self-Check: PASSED

- FOUND: `scripts/build-update-xml.mjs`, `scripts/verify-mar-update-hop.mjs`, `scripts/verify-platform.sh`
- FOUND commits: `32db3520`, `ee7efca1`, `b2ef66ee` (all ancestors of HEAD)

---
*Phase: 44-trust-path-b*
*Completed: 2026-10-31*
