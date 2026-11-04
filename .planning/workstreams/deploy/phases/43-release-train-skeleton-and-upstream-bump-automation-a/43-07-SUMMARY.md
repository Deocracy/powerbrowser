---
phase: 43-release-train-skeleton-and-upstream-bump-automation-a
plan: 07
status: complete
gap_closure: true
subsystem: infra
tags: [release-train, GH-15, known-issues, pinned-issue]
requirements-completed: []
requirements-advanced: [GH-15]
key-files:
  modified: [scripts/release-train.mjs, .github/workflows/release-train.yml, docs/RELEASING.md]
commits: [5035615b]
---

# 43-07 summary: GH-15 known-issues issue

Gap G-43, second half: the agent work of 50-04 Task 1. Plan 50-04 is an owner-checkpoint plan
and was not executed or resumed.

## What was built

- `knownIssuesPlan` and the CLI `--known-issues-plan` in `scripts/release-train.mjs`. The copy
  happens only when the pin's train has a Release that is published (`classifyRelease`) and not
  withdrawn. The body is a two-line header (release key, the Release's `published_at` day, the
  source path, where to report), two newlines, then the file bytes verbatim. The issue is titled
  `PowerBrowser known issues`. Zero matching issues means create and pin; one means PATCH only on
  a byte diff, and pin if it is unpinned; two or more is red naming the numbers. A header that
  carries a hex run of 7 or more characters, or a run link, is refused.
- `report` steps: read `docs/KNOWN-ISSUES.md` at the merge SHA with `gh api contents?ref=` (a
  read), find by title (a read), plan, a dry-run print, and one live write step gated
  `!inputs.dry-run`. That step pins through GraphQL `pinIssue` with the job token and prints the
  owner-click step if the token is refused.
- `docs/RELEASING.md`: "The pinned known-issues issue (GH-15)" record (pin budget 1 of 3,
  owner-click fallback line to fill). The stale "writer not wired" statements in Fixer spend,
  Fixer routing, Tracking issue and ESR 175 uptake were updated.

## Decisions

- The trigger is "published and not withdrawn", not "the tick that first derives PUBLISHED".
  Because the bytes compare is idempotent, later ticks write nothing, and a tick that misses
  PUBLISHED does not skip the copy.
- The header date is the Release's publish day, never the run date, so the bytes are stable.

## Verification

- Self-test: 4 GH-15 plants (duplicates, draft Release, withdrawn Release, SHA in the header)
  red; 2 controls (create+pin, then identical bytes write nothing and differing bytes PATCH;
  skip before any Release) green.
- The labels row first went red: its parser read `release-train)` from inside `$( … )`. Fixed by
  writing the create output to a file.
- The live step was run by hand under a fake `gh` that refuses GraphQL: create, then the
  node_id read, then the pin attempt, then the NOTE fallback, exit 0.
- `--quick`: only the three known reds (317 PASS).

## Open

- Whether the job token may call `pinIssue` is unverified. The fallback is the owner click,
  recorded in docs/RELEASING.md.
