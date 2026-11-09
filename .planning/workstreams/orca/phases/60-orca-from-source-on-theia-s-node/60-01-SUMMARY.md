---
phase: 60-orca-from-source-on-theia-s-node
plan: 01
subsystem: infra
tags: [orca, pin, fetch, nix, devshell, corepack, pnpm, verify-platform]

requires:
  - phase: 59-carry-forward-from-v1-5-and-v1-6
    provides: generator, upstream-pins fragment, verify-platform registry
provides:
  - "[upstreams] orca_tag / orca_commit in configuration.toml (peeled commit)"
  - "UPSTREAM_ORCA_TAG / UPSTREAM_ORCA_COMMIT in generated/upstream-pins.env, emitted only as a pair"
  - "scripts/fetch-orca.sh: verified clone into orca.partial, verify-instead-of-reclone, 7-case --self-test"
  - "scripts/verify-orca-pin.mjs: orca-pin check derived from configuration.toml, 9-plant --self-test"
  - "flake.nix devShells.orca (nodejs_24, corepack_24, python3, pkg-config, gnumake, binutils)"
  - "quick rows orca-pin, orca-pin-self-test, fetch-orca-self-test"
  - "a fetched, gitignored orca/ at 965978bc78bf03a6a43187c1ed28fcffe0e01bb5"
  - "owner approval of pnpm 12.14.0 for the corepack download in 60-02"
affects: [60-02, 60-03, 60-04, 60-05]

actuals:
  tokens: 9900
  tasks: 3
  commits: 2
plan_head_before: b4c3deb3a71ed01b5ac0f85c92b25f1348fdfaa9
plan_head_after: fa915d96fb963ad7eb88013476cc7647e38c46d3

tech-stack:
  added: [corepack_24 (nixpkgs, .#orca shell only)]
  patterns:
    - "Third-party source pin = tag plus peeled commit in the manifest, carried to scripts only through the generated fragment"
    - "Fetch scripts clone into <dir>.partial and verify HEAD before the rename"

key-files:
  created:
    - scripts/fetch-orca.sh
    - scripts/verify-orca-pin.mjs
  modified:
    - configuration.toml
    - scripts/lib/config-schema.json
    - scripts/generate.mjs
    - docs/REBRANDING.md
    - .gitignore
    - flake.nix
    - scripts/verify-platform.sh

key-decisions:
  - "pnpm 12.14.0 approved by Chris 2026-11-09 after comparing Orca's packageManager sha512 with the npm registry dist.integrity"
  - "Ignore rules are anchored (/orca/, /orca.partial/) so .planning/workstreams/orca/ stays stageable"
  - "Orca pin keys are optional in the schema; the generator refuses one without the other"

patterns-established:
  - "Self-test fixtures use synthetic pin values (v9.9.9, synthetic SHA) so a literal sweep never matches its own fixtures"

requirements-completed: [RUN-01]

coverage:
  - id: D1
    description: "Orca pin travels configuration.toml -> generated/upstream-pins.env -> fetch-orca.sh -> verified orca/ checkout"
    requirement: RUN-01
    verification:
      - kind: integration
        ref: "bash scripts/fetch-orca.sh (fresh clone, then re-run prints 'already at')"
        status: pass
      - kind: unit
        ref: "scripts/verify-platform.sh --only fetch-orca-self-test"
        status: pass
    human_judgment: false
  - id: D2
    description: "orca-pin quick row derived from configuration.toml with nine planted faults"
    requirement: RUN-01
    verification:
      - kind: unit
        ref: "scripts/verify-platform.sh --only orca-pin; --only orca-pin-self-test"
        status: pass
    human_judgment: false
  - id: D3
    description: ".#orca dev shell with Node 24.19.0, corepack and objdump"
    requirement: RUN-01
    verification:
      - kind: other
        ref: "nix develop .#orca --command bash -c 'node --version; corepack --version; objdump --version'"
        status: pass
    human_judgment: false
  - id: D4
    description: "pnpm 12.14.0 legitimacy confirmed by the owner before any corepack download"
    verification: []
    human_judgment: true
    rationale: "Package-legitimacy checkpoint (gate blocking-human); a too-new package cannot be auto-approved"

duration: 96min
completed: 2026-11-09
status: complete
---

# Phase 60 Plan 01: Orca pin, fetch and .#orca shell Summary

**Orca v1.4.248 pinned by tag and peeled commit in configuration.toml, carried through the generator to a verifying fetch-orca.sh, guarded by an orca-pin quick row with nine planted faults, plus a .#orca dev shell; pnpm 12.14.0 approved for corepack.**

## Performance

- **Duration:** about 96 min (plan base commit 11:54 PST to checkpoint approval and SUMMARY 13:30 PST)
- **Started:** 2026-11-09T19:54:36Z
- **Completed:** 2026-11-09T21:30:25Z
- **Tasks:** 3 (2 auto/tracer, 1 blocking-human checkpoint)
- **Files modified:** 9

## Accomplishments

- configuration.toml `[upstreams]` carries `orca_tag = "v1.4.248"` and `orca_commit = "965978bc78bf03a6a43187c1ed28fcffe0e01bb5"` (the peeled commit, not the tag object).
- `scripts/generate.mjs` emits `UPSTREAM_ORCA_TAG` / `UPSTREAM_ORCA_COMMIT` only as a validated pair; no `ORCA_*` name is minted.
- `scripts/fetch-orca.sh` fetches into `orca.partial`, refuses a HEAD that is not the pinned commit, and verifies an existing `orca/` instead of re-cloning; `orca/` is at 965978bc and ignored.
- `scripts/verify-orca-pin.mjs` (row `orca-pin`) derives the pin from the manifest; its self-test turns nine planted faults red.
- `devShells.orca` provides Node 24.19.0, corepack and objdump; `devShells.theia` and `default` drvPaths are unchanged.

pnpm legitimacy: approved by Chris on 2026-11-09. Orca packageManager sha512 (hex) c18ba6d87993d3d164cb5e8948f32b2c06ee854487e06cd8d86781342fb3e5bb4634367034711e86802baa9c37bea906ce1929ad08d70884c97d801df13389a6; npm registry dist.integrity sha512-wYum2HmT09Fky16JSPMrLAbuhUSH4GzY2GeBNC+z5btGNDZwNHEehoArqpw3vqkGzhkprQjXCITJfYAd8TOJpg== (hex c18ba6d87993d3d164cb5e8948f32b2c06ee854487e06cd8d86781342fb3e5bb4634367034711e86802baa9c37bea906ce1929ad08d70884c97d801df13389a6). The digests are equal. pnpm 12.14.0 was published 2026-10-15T13:39:41Z.

## Task Commits

1. **Task 1: tracer, pin from configuration.toml to a verified orca/ checkout** - `5320e065` (feat)
2. **Task 2: orca-pin check with planted-fault self-test, .#orca dev shell, three registry rows** - `fa915d96` (feat)
3. **Task 3: pnpm 12.14.0 legitimacy checkpoint** - no commit (read-only); approved by Chris 2026-11-09

## Files Created/Modified

- `configuration.toml` - `[upstreams] orca_tag`, `orca_commit` plus comment lines
- `scripts/lib/config-schema.json` - optional rows `upstreams.orca_tag`, `upstreams.orca_commit`
- `scripts/generate.mjs` - `emitUpstreamPins` emits the Orca pair; banner and doc comment updated
- `docs/REBRANDING.md` - heading and two optional-key rows
- `.gitignore` - anchored `/orca/`, `/orca.partial/`
- `scripts/fetch-orca.sh` - pinned fetch with commit verification and `--self-test`
- `scripts/verify-orca-pin.mjs` - `orca-pin` check with `--self-test`
- `flake.nix` - `devShells.orca`
- `scripts/verify-platform.sh` - rows `orca-pin`, `orca-pin-self-test`, `fetch-orca-self-test`

## Decisions Made

- pnpm 12.14.0 approved by the owner (see the "pnpm legitimacy" line above).
- Schema keys are optional so downstream manifests and milestone fixtures stay valid; the pair rule is enforced in the generator.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Detached-HEAD advice suppressed in the fetch clone**
- **Found during:** Task 1
- **Issue:** `git clone --branch <tag>` prints git's multi-line detached-HEAD advice into the fetch output.
- **Fix:** the clone runs as `git -c advice.detachedHead=false clone --depth 1 --branch "$TAG" ...`.
- **Files modified:** scripts/fetch-orca.sh
- **Committed in:** 5320e065

**2. [Rule 1 - Bug] fetch-orca.sh self-test case 6 uses its own fixture tag**
- **Found during:** Task 2
- **Issue:** case 6 (TAG without COMMIT) used the synthetic tag v9.9.9, which orca-pin's literal sweep uses for its own plants; the sweep over tracked scripts would then find that value in fetch-orca.sh.
- **Fix:** case 6 uses the fixture tag v1.0.0, so v9.9.9 appears only in verify-orca-pin.mjs.
- **Files modified:** scripts/fetch-orca.sh
- **Committed in:** fa915d96

**3. [Documentation correction] pnpm 12.14.0 publish date**
- **Found during:** Task 3
- **Issue:** the plan and research state 12.14.0 was published 2026-11-05.
- **Fix:** the npm registry `time["12.14.0"]` is 2026-10-15T13:39:41Z; 2026-11-06 is the package-level `time.modified`. Recorded here; the plan text is not edited.
- **Committed in:** this SUMMARY

**Total deviations:** 3 (2 Rule 1, 1 documentation correction)
**Impact on plan:** none on scope; all three keep the checks and records accurate.

## Issues Encountered

None beyond the deviations.

## User Setup Required

None.

## Next Phase Readiness

60-02 may run corepack and the first real Orca build: `orca/` is at the pin, `.#orca` exists, pnpm 12.14.0 is approved. RUN-01 is also declared by 60-02 (build half); its checkbox depends on 60-02.

## Self-Check: PASSED

- FOUND: scripts/fetch-orca.sh, scripts/verify-orca-pin.mjs
- FOUND: 5320e065, fa915d96 (ancestors of HEAD)
