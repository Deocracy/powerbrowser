---
phase: 51-dependency-flow-and-train-supersede-f
plan: 06
subsystem: repo-controls
status: complete
gap_closure: true
tags: [dependabot, repo-controls, auto-03]
requires:
  - 51-02 (dependabot-alerts control)
provides:
  - .github/settings/automated-security-fixes.json
  - repo-controls CONTROLS entry automated-security-fixes
key-files:
  created:
    - .github/settings/automated-security-fixes.json
  modified:
    - scripts/verify-repo-controls.mjs
    - docs/RELEASING.md
decisions:
  - "Live shape read first (GET repos/Deocracy/powerbrowser/automated-security-fixes, 2026-11-03): {\"enabled\":true,\"paused\":false}. The body declares enabled only; paused is GitHub's and is not compared."
  - "The control sits directly after dependabot-alerts, so apply enables alerts before security updates."
  - "The RELEASING.md controls table also gains the two rows 51-02 left out (Dependabot alerts, CodeQL default setup)."
metrics:
  completed: 2026-11-03
actuals:
  tasks: 1
  commits: 2
plan_head_before: c83d885b
---

# Phase 51 Plan 06: automated-security-fixes read-back control Summary

The Dependabot security updates switch now has a control (owner ruling 2026-11-03, BLOCKED.md item 12). Turning it off makes
`repo-controls` red.

## Verification

- `node scripts/verify-repo-controls.mjs --self-test`: PASS, 79 plants. The two new ones (switch off, endpoint unreadable) go red
  naming `automated-security-fixes`.
- `scripts/verify-platform.sh --quick`: the only red is `fixer-isolate-self-test` (known).

## Open (owner, live)

- The PUT is part of `node scripts/apply-repo-controls.mjs --yes` (41-04). The switch is already on live, so apply changes nothing.

## Self-Check: PASSED
