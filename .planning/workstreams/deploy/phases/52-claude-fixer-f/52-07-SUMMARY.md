---
phase: 52-claude-fixer-f
plan: 07
gap_closure: true
gap: G-52
status: complete
requirements: [FIX-01, TRAIN-06]
key-files:
  modified:
    - .planning/workstreams/deploy/phases/52-claude-fixer-f/52-CONTEXT.md
    - .planning/workstreams/deploy/phases/52-claude-fixer-f/52-05-PLAN.md
    - docs/RELEASING.md
commits: [0553b30e]
---

# 52-07 summary: F1 scope-reduction text (G-52)

- 52-CONTEXT.md: new `<amendments>` section records the 2026-11-03 ruling (F1 owner-resolved,
  F2/F3 automated), the reason (WR-08: no working patch tool on a conflicting stack), the
  enforcing guard (`fixerInputsCheck`, `class-f1`) and the amended IDs (FIX-01, TRAIN-06, ROADMAP
  Phase 52 criterion 1, already amended in aef3a1b5).
- 52-05-PLAN.md reply field 5: `class F2/F3; F1 is owner-resolved`.
- docs/RELEASING.md (Phase 58 uptake text, two places): F1 is no longer routed to the fixer.
- Pin confirmed, unchanged: `@anthropic-ai/claude-code@2.1.314` in
  `.github/fixer/claude-cli/package.json`, its lockfile (integrity
  `sha512-iD58PXZvNCykRm3ZRiV/zJOsejXH/FtLZFtsFqUHxFxBsthOyb+0MINeJ8EsNbSG8ECTsfhzPIZwl8x6NIRkSg==`),
  and release-train.yml:1555 `CLAUDE_CODE_VERSION: "2.1.314"`; claude-code-action at
  `db77d4d3c98f3f6380e7cd45ffba2342a3dbde3c`. BLOCKED.md item 3 still needs the owner's "confirmed".
- `--quick`: only `fixer-isolate-self-test` red (known sandbox red).
