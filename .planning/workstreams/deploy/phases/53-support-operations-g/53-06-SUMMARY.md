---
phase: 53-support-operations-g
plan: 06
gap_closure: true
gap: Phase 53 ruling (claude-code-action admission, 53-REVIEW IN-02)
status: complete
requirements: [GH-03, FIX-08]
key-files:
  modified:
    - .github/settings/actions-selected.json
    - scripts/verify-workflows.mjs
    - scripts/lib/channel-workflow-rules.mjs
    - .planning/workstreams/deploy/phases/53-support-operations-g/BLOCKED.md
commits: [2a2b6b62]
---

# 53-06 summary: claude-code-action admitted at its pinned commit only

- `.github/settings/actions-selected.json`: `anthropics/claude-code-action@*` is replaced by
  `anthropics/claude-code-action@db77d4d3c98f3f6380e7cd45ffba2342a3dbde3c`.
- `scripts/verify-workflows.mjs`:
  - `PATTERN` accepts `owner/repo@*` and `owner/repo@<40-hex>`; the admission table maps each
    repo to its admitted refs. A `uses:` line is admitted when its repo has `*` or its exact
    commit; otherwise `uses-admitted` reds with "admits <repo> only at <sha>".
  - New fact under `uses-admitted`: the claude-code-action admission must be exactly `FIX_PIN`,
    the constant the `fixer-pin` rule already holds every step to. A star, a second ref or
    another commit reds on actions-selected.json.
  - `admission-used` iterates the repo keys (unchanged meaning).
  - Self-test: `withClaude` adds `FIX_PIN`; four new plants (star entry, star beside the pin,
    cachix admitted at a commit verify.yml does not use, a tag-ref entry `foo/bar@v1`), each red
    naming the drift. `workflows: --self-test PASS -- 219 planted faults ... 11 controls`.
- `scripts/lib/channel-workflow-rules.mjs` (not in the original plan list; added to the plan):
  its copy of the admission rule accepted only `@*`, so a commit-form admission of an action the
  channel workflow uses would have gone red falsely. It now accepts `<repo>@<the step's commit>`.
- BLOCKED.md item 1 step 3 names the commit form.

## Verification

- `node scripts/verify-workflows.mjs` PASS (7 workflows, 71 uses lines). channel-release-jobs
  check and self-test PASS (72 plants). repo-controls self-test PASS (79 plants). triage-workflow
  PASS.
- `node scripts/generate.mjs`: no change under generated/. `--quick`: 323 PASS, only
  `fixer-isolate-self-test` red (known).
- Owner action at 53-04 T2 step 1: apply the file through the repo-controls apply; the live
  `repo-controls` row compares the live selected-actions body with this file.
