---
phase: 41-repository-controls-and-github-apps-a
plan: 05
subsystem: repo-controls
gap_closure: true
status: complete
tags: [GH-10, R10, apps, repo-controls]
key-files:
  modified:
    - scripts/verify-repo-controls.mjs
commits: [2d99944c]
---

# 41-05 Summary: apps control scoped to the declared repositories (G-ctl, R10)

`compareApps` now derives the protected repository set from the declared App bodies
(union of `repositories`: powerbrowser, powerbrowser-updates, homebrew-tap). An undeclared
installation is reported (undeclared, or holding Workflows) only when its
`repository_selection` is `all` or its repository list (`user/installations/{id}/repositories`)
touches that set. An undeclared `selected` installation whose list cannot be read is red
(fail closed). Declared Apps are always in scope, so a declared App with Workflows stays red.

## Verification

- `node scripts/verify-repo-controls.mjs --self-test`: PASS, 77 plants red, 6 controls green.
  New plants (red): undeclared App selected on homebrew-tap; undeclared App with selection all;
  undeclared selected App with an unreadable list; undeclared App with Workflows selected on
  powerbrowser-updates. New controls (green): undeclared App with Workflows selected only on
  other repositories; undeclared App selected on no repository.
- Live read-only run: still FAIL, 60 problems; `claude` and `slack` stay red because both are
  still installed with selection `all`. They go green after the owner applies R10 (Stage E step 1).
- `scripts/verify-platform.sh --quick`: green except the known reds (permission-prompts,
  permission-prompts-self-test, fixer-isolate-self-test). `generate.mjs` changed nothing.

## Deviations

None. The decision in STATE.md "any Workflows key on any org installation is red" (41-02) is
narrowed to in-scope installations by R10.
