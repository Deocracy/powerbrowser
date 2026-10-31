---
phase: 52-claude-fixer-f
plan: 01
subsystem: infra
tags: [fix-gate, deny-list, patches, regenerate-patches, verify-platform, quick-registry]

requires:
  - phase: 41-repository-controls-and-github-apps-a
    provides: the verify-platform quick registry shape and the workflows row this gate sits beside
provides:
  - .github/fix-gate-deny.json, the FIX-11 deny list (version 1, 13 path globs)
  - scripts/verify-fix-gate.mjs, the fix gate with the path, apply, regenerate-patches --check, non-vacuity, check-patch-surface, scan-brand-residue, diff-theia-core and --quick stages, plus --self-test
  - the fix-gate-self-test quick registry row
affects: [52-02, 52-04, fixer workflow, fix-gate job]

actuals:
  tokens: 6761
  tasks: 3
  commits: 1

tech-stack:
  added: []
  patterns:
    - "Deny list read by both the gate and its self-test; plants derived from the file, never hand-kept"
    - "In-memory stage proxies for the self-test; real scripts run only in a throwaway git worktree"

key-files:
  created:
    - .github/fix-gate-deny.json
    - scripts/verify-fix-gate.mjs
  modified:
    - scripts/verify-platform.sh

key-decisions:
  - "The self-test stubs stage 8 (verify-platform --quick): the row is itself a --quick row, so the self-test would re-enter it"
  - "Hand-edit detection in memory is a proxy: a changed patch hunk with no changed index line (blob hash) is a hand edit. regenerate-patches.sh --check is the byte authority in the real run"
  - "CR-01: a moved patch is compared on +/- lines only; a context-only change there is a NOTE, not a rejection"
  - "regenerate-patches --check runs only when the diff touches patches/; the --quick suite covers the rest of the tree"
  - "Registry-named set and compiled-suffix set are parsed from scripts/verify-platform.sh and scripts/check-patch-surface.sh at check time"

patterns-established:
  - "Gate stages named in every rejection: [path], [apply], [regenerate-patches --check], [non-vacuity], [check-patch-surface], [scan-brand-residue], [diff-theia-core], [verify-platform --quick]"
  - "Plant list derived from the deny file: one plant per entry, sample path derived from the glob, checked to match its own glob before it runs"

requirements-completed: [FIX-11, FIX-07, FIX-02]

duration: one session
completed: 2026-10-31
status: complete
---

# Phase 52 Plan 01: Fix gate tracer, deny list and quick row

**Deny list, offline fix gate and quick registry row: the fixer's diff is refused by path, by hand-edited patch hunk and by the real stage chain, each rejection naming its stage and path.**

## Performance

- **Tasks:** 3 (landed as one code commit; see Deviations)
- **Files created:** 2; **files modified:** 1 (registry, 7 lines)

## Accomplishments

- `.github/fix-gate-deny.json` holds the 13 FIX-11 path globs in the declared order, version 1.
- `scripts/verify-fix-gate.mjs` runs the chain in the declared order. Path, apply (structural), regenerate-patches --check (structural proxy), non-vacuity, check-patch-surface, scan-brand-residue and diff-theia-core run in memory. The CLI run repeats the real scripts in a throwaway worktree, then runs verify-platform --quick there.
- `--self-test` builds 19 planted diffs in memory: one per deny entry, one registry-named file, a hand-edited patch hunk, a vacuous diff, a compiled-file patch target, a brand-identifier token and a Theia core path. Each goes red naming its stage and path. Three controls stay green: a docs-only change, a patch whose index line changed, and a moved patch with a context-only change (CR-01, quoted as a NOTE).
- Registry row `fix-gate-self-test` added after `zizmor-self-test` in the quick CHECKS array.

## Task Commits

Tasks 1 to 3 touch one new file and one registry row. Splitting them would leave the row pointing at a gate that does not yet exist, so they landed together:

1. **Task 1: deny file, gate skeleton with registry-derived set, quick row** - `ee54b6d` (feat)
2. **Task 2: chain order (non-vacuity, surface, brand residue, theia core, then --quick)** - in `ee54b6d` (same file)
3. **Task 3: FIX-02 regeneration half (hand-edit proxy, CR-01 control)** - in `ee54b6d` (same file)

**Plan metadata:** the `docs(52-01)` commit that adds this file

## Verification

- `node scripts/verify-fix-gate.mjs --self-test`: `fix-gate: --self-test PASS -- 19 planted faults went red naming their stage and path (13 deny entries, read from .github/fix-gate-deny.json), and 3 controls stayed green`
- `scripts/verify-platform.sh --only fix-gate-self-test`: `fix-gate-self-test: PASS`
- `scripts/verify-platform.sh --only patches-regenerated-self-test`: PASS (write mode adjacent proof)
- `node scripts/scan-brand-residue.mjs` after `git add` of the two new files: exit 0, 446 files scanned
- `scripts/verify-platform.sh --quick` after this plan: `verify-platform: PASS -- all checks passed` (exit 0). Baseline before the plan: the same result. No new reds.
- Real gate, docs-only control diff, run inside `nix develop .#theia`: apply, check-patch-surface, scan-brand-residue and diff-theia-core passed in the throwaway worktree. The verify-platform --quick stage failed in that fresh worktree (see Issues Encountered).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] The real gate's Theia stage needs the nix theia shell**
- **Found during:** real run of the gate on a docs-only control diff
- **Issue:** diff-theia-core.sh needs yarn, which the host shell lacks
- **Fix:** the gate is run as `nix develop .#theia --command ...`, as CLAUDE.md requires for Theia tooling. The gate script is unchanged.
- **Committed in:** `CODE_HASH`

**2. [Rule 2 - Missing critical] Real worktree needs the ignored inputs to exist**
- **Found during:** real run, stage 8
- **Issue:** the fresh worktree has no git-ignored `upstream/`, `theia/node_modules/` or `generated/`
- **Fix:** the real stage copies `generated/` (260K, its generator writes into it) and symlinks `upstream/` and `theia/node_modules/` after `git add -A`, so the links are not staged
- **Committed in:** `CODE_HASH`

## Issues Encountered

- **Stage 8 is not proven green in a fresh worktree.** With the symlinks above, the real `verify-platform --quick` in the worktree still fails in row `ng086-theia-react-node` ("empty walk: no installed @theia/* package was found under theia/"). The same walker passes in the gate's own checkout. The row's walker does not follow the linked `theia/node_modules`. This is an environment limit of the worktree, not a gate defect. The fix-gate job (plan 52-04) must prepare the worktree (fetch upstream at the tag, install theia/ dependencies) before stage 8, or stage 8 must run in a full checkout.
- The baseline `--quick` (before this plan) passed with exit 0 on this tree, so no pre-existing reds were recorded.

## Threat Flags

| Flag | File | Description |
|------|------|-------------|
| threat_flag: transitive execution | scripts/verify-fix-gate.mjs | The real stage 8 runs verify-platform --quick in the worktree, which executes every script a quick row runs. The deny list and the registry-named set cover only the scripts a row names directly. A helper that a row sources, but that no row names, can come from the fixer's diff and run in the gate job. The gate job has no secrets and only contents: read, so the impact is a weakened gate verdict, which the owner's review still gates. Open for plan 52-04 or the owner: run stage 8 from a target-ref copy, or deny scripts/** for the fixer. |

## Next Phase Readiness

- Plan 52-02 extends the workflows row for the fixer. Its admission task has a conflict, recorded in that plan's SUMMARY.
- The fix-gate job in plan 52-04 must prepare the worktree before stage 8 (see Issues Encountered) and must close the transitive-execution flag.

---
*Phase: 52-claude-fixer-f*
*Completed: 2026-10-31*
