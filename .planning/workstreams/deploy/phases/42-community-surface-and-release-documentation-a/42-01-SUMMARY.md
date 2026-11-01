---
phase: 42-community-surface-and-release-documentation-a
plan: 01
subsystem: infra
tags: [github-labels, repo-controls, settings-as-code, gh-cli, self-test]

# Dependency graph
requires:
  - phase: 41-repository-controls-and-github-apps-a
    provides: CONTROLS table, planWrites, runChecks, apply-repo-controls dry-run, repo-controls-self-test row
provides:
  - .github/settings/labels.json, the declared GH-13 label set (24 names)
  - a labels control in CONTROLS: live names compared as a set against the declared names
  - owner steps for label create-or-update (gh label create --force) and delete (gh label delete)
  - tree-level checks: declared set non-empty, every entry shaped, unique case-insensitively
affects: [42-02 labels quick row, 42-04 owner checkpoint, 52-claude-fixer, 43-release-train-skeleton]

# Actuals (#2632)
actuals:
  tokens: 3000
  tasks: 2
  commits: 1

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "names are the contract; color and description are presentation (a re-tint never goes red)"
    - "label writes are owner steps listed by the control, never written by the executor"

key-files:
  created:
    - .github/settings/labels.json
  modified:
    - scripts/verify-repo-controls.mjs

key-decisions:
  - "good-first-issue is hyphenated; the space-named GitHub default is deleted at apply"
  - "train:blocked keeps its colon form"
  - "the five live gsd:* automation labels are deleted at apply, not declared (owner may reverse at 42-04)"
  - "canonical-name decisions are recorded as a comment in verify-repo-controls.mjs, because labels.json is strict JSON and cannot carry a header comment"
  - "the labels control is write: null with ownerSteps, so planWrites order and apply-repo-controls.mjs are unchanged"

patterns-established:
  - "Owner step ordering: all gh label create lines first (labels.json order), then gh label delete lines, so no delete runs before its replacement exists"

requirements-completed: [GH-13]

coverage:
  - id: D1
    description: "labels.json declares the 24 GH-13 names with 6-hex colors and descriptions"
    requirement: "GH-13"
    verification:
      - kind: automated_ui
        ref: "node -e shape check over .github/settings/labels.json (24 names, 24 unique case-insensitive, hex colors)"
        status: pass
    human_judgment: false
  - id: D2
    description: "repo-controls read-back compares live label names to labels.json as a set and goes red naming each drift"
    requirement: "GH-13"
    verification:
      - kind: unit
        ref: "scripts/verify-repo-controls.mjs --self-test (labels plants: extra, missing, throwing endpoint, case duplicate, empty array, malformed color, removed file)"
        status: pass
    human_judgment: false
  - id: D3
    description: "a re-tinted label stays green"
    requirement: "GH-13"
    verification:
      - kind: unit
        ref: "scripts/verify-repo-controls.mjs --self-test (control: a label re-tinted and re-described)"
        status: pass
    human_judgment: false
  - id: D4
    description: "apply dry-run prints create-or-update lines before delete lines and no label write"
    requirement: "GH-13"
    verification:
      - kind: automated_ui
        ref: "node scripts/apply-repo-controls.mjs | awk create-before-delete (24 creates, 14 deletes)"
        status: pass
    human_judgment: false

duration: ~40min
completed: 2026-10-29
status: complete
---

# Phase 42 Plan 01: Declared GH-13 label set and labels control in repo-controls

**The 24-label GH-13 set is declared in labels.json and read back by repo-controls as a name set; the live apply stays with the owner (42-04).**

## Performance

- **Duration:** about 40 min
- **Started:** not recorded (executor started 2026-10-29)
- **Completed:** 2026-10-29
- **Tasks:** 2 (both in one commit, see Deviations)
- **Files modified:** 2

## Accomplishments
- `.github/settings/labels.json` declares 24 labels across the type, os, format and area families plus the triage, release and automation names.
- `scripts/verify-repo-controls.mjs` gains a `labels` control in CONTROLS. It reads `repos/{owner}/{repo}/labels?per_page=100`, compares names as sets, and emits one failure per missing declared name and per extra live name.
- The `labels` control contributes owner steps (create-or-update lines, then delete lines, then one generic delete line) through the existing `planWrites` collection. `apply-repo-controls.mjs` is untouched.
- A tree-level check (`labelSetFailures`) runs on every `runChecks` call: the declared array must be non-empty, each entry must have a name, a six-digit lowercase hex color and a description, and names must be unique case-insensitively.
- Self-test: 8 new label plants (live extra, declared missing, throwing labels endpoint, case-variant duplicate, empty array, malformed color, labels.json removed) and one green control (a re-tinted label). Output of `--self-test` is PASS with 59 planted faults.

## Dry-run owner steps (pre-apply baseline)

`node scripts/apply-repo-controls.mjs` (dry-run, exit 0) lists 24 `gh label create ... --force -R DeBIOS-Foundation/powerbrowser` lines, then 13 `gh label delete ... --yes` lines (accessibility, bug, documentation, enhancement, good first issue, help wanted, invalid, question, gsd:approved, gsd:blocked, gsd:escalated, gsd:ready, gsd:rework), then the generic delete line. The write list contains no label write. Create lines precede delete lines.

## Live read-back (pre-apply baseline, GET only)

`node scripts/verify-repo-controls.mjs` exits 1, as expected before the owner apply. The labels control reports:
- 22 declared labels missing live (every declared name except `duplicate` and `wontfix`, which already exist with the same name)
- 13 live labels extra (the 8 GitHub defaults and 5 gsd:* labels listed above)
- no "could not be read" line for the labels endpoint

The other red lines (actions permissions, environments, rulesets, Apps and org) are Phase 41 owner-apply drift and are out of this plan's scope.

## Task Commits

1. **Task 1 and Task 2 (labels.json declaration, labels control, plants, uniqueness and owner-step order):** `eb40b7f` (feat)

Both tasks edit the same control in one pass, so they share one commit. See Deviations.

## Files Created/Modified
- `.github/settings/labels.json` - the declared GH-13 label set (24 names, colors, descriptions)
- `scripts/verify-repo-controls.mjs` - labels control, `labelOwnerSteps`, `compareLabels`, `labelSetFailures`, fake labels endpoint, label plants, `ownerSteps` receives the run context

## Decisions Made
- Canonical names: `good-first-issue` (hyphenated, space-named default deleted), `train:blocked` (colon form kept), gsd:* labels deleted at apply, not declared. Recorded as a comment next to the control, not in labels.json.
- Color and description are presentation; only names decide the row, so a re-tint stays green.
- Descriptions use plain user words and carry no internal identifiers. `wontfix` and `duplicate` point at the next step rather than at the reporter.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Owner steps need the repository slug**
- **Found during:** Task 1
- **Issue:** `labelOwnerSteps` must print `-R owner/repo` so the owner's gh calls target the right repository regardless of the working directory. The existing `ownerSteps(c, declared)` signature has no context.
- **Fix:** `planWrites` now passes `ctx` as a third argument to `ownerSteps`. Existing `ownerSteps` functions ignore it, so their output is unchanged. The plan said planWrites needed no change; this is a one-argument change.
- **Files modified:** scripts/verify-repo-controls.mjs
- **Commit:** eb40b7f

**2. [Rule 2 - Missing critical] Declared-set validation beyond the plan's list**
- **Found during:** Task 2
- **Issue:** Without a shape check, a declared entry with a missing color or description produces owner steps containing `undefined`, and the uniqueness check would not catch it.
- **Fix:** `labelSetFailures` also requires name, six-digit hex color and description per entry, with a plant that goes red.
- **Commit:** eb40b7f

### Process deviations

- **Single commit for two tasks.** Plan says one commit per task; Tasks 1 and 2 edit the same control and self-test in one pass, so splitting would require an intermediate state where labels.json is an orphan or unreferenced. Both are in `eb40b7f`.
- **Commit despite "Do not commit".** The plan text says to leave files on disk. The orchestrating instruction for this run says to commit atomically per task, and that instruction was followed.
- **Ledger base recorded late.** The plan-head base for this plan was written after the commit, using the HEAD recorded before the first commit (698658c). The value is correct; the file was not written before the first commit as the protocol asks.

## Issues Encountered
- git author identity is not configured in this environment; the commit used the user's identity from the run context via environment variables only, with no change to git config.

## Known Stubs
None.

## Owner follow-up
- **Decide whether the five gsd:* labels are deleted at apply (42-04).** The plan's recommended default is delete. The gsd-loop skills use `gsd:ready` as their build queue, so deleting it stops the loop until the queue moves to a declared label. Owner choice: keep the five and declare them (edit labels.json and the delete list), or delete them and update the loop.
- **Live apply of the label set (42-04):** run the printed `gh label create` lines, then the `gh label delete` lines, then the generic delete review. This is an owner write; the executor did not run it.

## Self-Check: PASSED
- labels.json exists and is tracked in `eb40b7f`.
- verify-repo-controls.mjs `--self-test` exits 0.
- `scripts/verify-platform.sh --quick` exits 0 after staging.
