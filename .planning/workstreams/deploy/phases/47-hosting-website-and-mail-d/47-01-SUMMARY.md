---
phase: 47-hosting-website-and-mail-d
plan: 01
subsystem: testing
tags: [verify-registry, updates-host, cloudflare-pages, absence-property, gh-api]

requires:
  - phase: 41-repository-controls-and-github-apps-a
    provides: scripts/verify-repo-controls.mjs fail-closed read-back pattern and the pinned gh API version header
provides:
  - scripts/verify-updates-repo-static.mjs (updates-repo-static row, ghGet, repoSlug, runChecks, in-memory --self-test)
  - Registry rows updates-repo-static-self-test (quick) and updates-repo-static (full tier) in scripts/verify-platform.sh
affects: [47-03, 47-04, 48-error-telemetry-maintenance-sweep-and-watchdog-d]

actuals:
  tokens: 3900
  tasks: 2
  commits: 1

tech-stack:
  added: []
  patterns:
    - "Absence-property read-back: one recursive tree listing, failures name each forbidden path"
    - "Owner and updates repo derived from configuration.toml [urls] release_notes plus an updates suffix"

key-files:
  created:
    - scripts/verify-updates-repo-static.mjs
  modified:
    - scripts/verify-platform.sh

key-decisions:
  - "Compute is detected by path: a directory named functions at any depth, or a root-level _worker.js. Nested _worker.js is not flagged (the spec names the root file only)."
  - "Every unreadable shape fails closed naming the tree endpoint: a throw, a malformed result, a non-2xx, unparseable JSON, a truncated listing, a non-array tree, an empty tree."
  - "The live row stays read-only and writes nothing; no org or repo literal is written in the script."

patterns-established:
  - "Static-shape read-back: the row asserts absence on the live tree and its self-test plants each signal in memory"

requirements-completed: [DIST-03]

coverage:
  - id: D1
    description: "updates-repo-static full-tier row fails on a functions/ directory or root _worker.js in the live updates repo and fails closed on any unreadable tree"
    requirement: "DIST-03"
    verification:
      - kind: automated
        ref: "scripts/verify-updates-repo-static.mjs"
        status: pass
    human_judgment: false
  - id: D2
    description: "updates-repo-static-self-test plants ten faults in memory over a clean static tree that must stay green first"
    requirement: "DIST-03"
    verification:
      - kind: automated
        ref: "scripts/verify-platform.sh --only updates-repo-static-self-test"
        status: pass
    human_judgment: false
  - id: D3
    description: "Live proof that the served updates tree is static-only (green against the real repo)"
    requirement: "DIST-03"
    verification: []
    human_judgment: true
    rationale: "The live updates repo is empty until the owner pushes the static tree at plan 47-04; the green run is owner-gated."

duration: approx. 1h
completed: 2026-10-29
status: complete
---

# Phase 47 Plan 01: updates-repo-static row and self-test Summary

**Full-tier updates-repo-static row enforces the static-only updates host (no functions/, no root _worker.js) with ten in-memory planted faults in the quick self-test.**

## Performance

- **Duration:** approx. 1h
- **Started:** not recorded at start
- **Completed:** 2026-10-29
- **Tasks:** 2 (both implemented in one commit, see Deviations)
- **Files modified:** 2

## Accomplishments

- `scripts/verify-updates-repo-static.mjs` reads one recursive tree listing of the updates repo through a read-only `gh api` GET pinned to `X-GitHub-Api-Version: 2022-11-28`.
- The absence property fails each path under a `functions` directory at any depth and the root-level `_worker.js`, naming the exact path.
- Every unreadable shape fails closed, naming the tree endpoint: throw, malformed result, non-2xx, non-JSON, truncated listing, non-array tree, empty tree.
- Owner and repo come from `configuration.toml [urls] release_notes`; the updates repo is the repo stem plus the updates suffix. No org or repo literal is in the script.
- Registry: `updates-repo-static-self-test` in the quick array beside `repo-controls-self-test`; `updates-repo-static` in the full-tier block beside `repo-controls`.

## Self-test output

```
  ok  baseline: the clean static tree -> green (2 path(s))
  ok  a functions hook file -> red naming functions/hook.js
  ok  a root-level worker file -> red naming _worker.js
  ok  a nested functions path -> red naming default/functions/route.js
  ok  a truncated listing -> red naming repos/DeBIOS-Foundation/powerbrowser-updates/git/trees/main?recursive=1
  ok  a non-array tree -> red naming repos/DeBIOS-Foundation/powerbrowser-updates/git/trees/main?recursive=1
  ok  an empty listing -> red naming repos/DeBIOS-Foundation/powerbrowser-updates/git/trees/main?recursive=1
  ok  a getter that throws -> red naming repos/DeBIOS-Foundation/powerbrowser-updates/git/trees/main?recursive=1
  ok  a malformed getter result -> red naming repos/DeBIOS-Foundation/powerbrowser-updates/git/trees/main?recursive=1
  ok  a non-github release_notes host -> throws naming configuration.toml [urls] release_notes
  ok  an unknown argument -> exit 2 with a Next step line
updates-repo-static: --self-test PASS -- the clean tree stayed green and 10 planted faults each went red naming their path, endpoint or key
```

## Pre-checkpoint live baseline

Read-only run against the live repo, before the owner pushes the static tree (the repo is empty, so GitHub returns HTTP 409 for the tree):

```
updates-repo-static: FAIL -- 1 problem(s) in the live tree of DeBIOS-Foundation/powerbrowser-updates (repos/DeBIOS-Foundation/powerbrowser-updates/git/trees/main?recursive=1)
  GET repos/DeBIOS-Foundation/powerbrowser-updates/git/trees/main?recursive=1 could not be read (gh: Git Repository is empty. (HTTP 409)). Next step: run gh auth status (the row needs the repo and read:org scopes); an absent or empty repo reads the same way until the static tree is pushed.
```

The fail-closed path is exercised as expected: an unreadable tree is red, never green. A fake `gh` that exits 1 produces the same red summary naming the tree endpoint.

## Quick gate

`scripts/verify-platform.sh --quick` exits 0: `verify-platform: PASS -- all checks passed`. `updates-repo-static-self-test: PASS` is in the run summary.

## Task Commits

1. **Tasks 1 and 2: updates-repo-static row, self-test, and registry rows** - `2728560` (feat)

## Deviations from Plan

### Auto-fixed Issues

None of the Rule 1-3 kind.

### Process notes

**1. Tasks 1 and 2 landed in one commit.** The Task 2 hardening (nested functions path, truncated, empty, throwing getter, non-github host, and the full plant matrix) was written into the file before the first commit, so the two tasks share commit `2728560`. Task 2's verify and acceptance checks were run against that commit.

**2. Cached safeGetter simplified.** The row makes exactly one read per run, so the planned cache is not needed. The wrapper still converts a throw or malformed result to an unreadable endpoint.

**3. Unknown-argument plant spawns the script itself.** The self-test runs `node scripts/verify-updates-repo-static.mjs --bogus` and requires exit 2 with a Next step line. The argument guard runs before any read, so this makes no network call and no gh call.

**4. Commit identity.** No git identity was configured in the clone, so the commit used `-c user.name` and `-c user.email` for the owner identity per command. Nothing was written to git config.

## Owner follow-up

- None for this plan. The live half (the tree passing green against a static-only updates repo) is the owner checkpoint in plan 47-04.

## Known Stubs

None.

## Threat Flags

None. The row issues read-only GETs only, stores no credential and prints none.

## Self-Check: PASSED

- `scripts/verify-updates-repo-static.mjs` exists and is committed in `2728560`.
- `scripts/verify-platform.sh` rows are committed in `2728560`.
- `git merge-base --is-ancestor 2728560 HEAD` holds.
