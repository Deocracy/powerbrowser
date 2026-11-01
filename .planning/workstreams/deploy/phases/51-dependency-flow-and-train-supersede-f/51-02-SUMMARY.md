---
phase: 51-dependency-flow-and-train-supersede-f
plan: 02
subsystem: infra
tags: [dependabot, codeql, repo-controls, auto-03]

requires:
  - phase: 41-repository-controls-and-github-apps-a
    provides: scripts/verify-repo-controls.mjs CONTROLS table, apply-repo-controls.mjs, .github/settings bodies
provides:
  - .github/dependabot.yml (weekly grouped github-actions, npm /theia security-only)
  - dependabot-alerts and code-scanning-default-setup bodies, CONTROLS entries and self-test plants
affects: [51-04, owner items 11-12 in BLOCKED.md, TRAIN-11]

key-files:
  created:
    - .github/dependabot.yml
    - .github/settings/dependabot-alerts.json
    - .github/settings/code-scanning-default-setup.json
  modified:
    - scripts/verify-repo-controls.mjs

key-decisions:
  - "npm security-only is open-pull-requests-limit: 0 (schema: the limit for version updates; minimum 0). No other key expresses it."
  - "Dependabot alerts answer by status (204 on, 404 off). A control-level liveFrom maps that, so a 204 or 404 on any other control stays unreadable."
  - "CodeQL default setup has no path filter; coverage of theia/extensions and scripts/ is the language javascript-typescript. Languages compare as a superset, state and query_suite exactly."
  - "apply-repo-controls.mjs needed no edit: planWrites carries both new writes (lines 19 and 20 of the dry-run)."

requirements-completed: []
requirements-partial: [AUTO-03]  # declared and read back; live CodeQL enable and the first grouped PR are the owner's (BLOCKED items 11, 12)

completed: 2026-10-31
status: partial
---

# Phase 51 Plan 02: Dependabot flow, alerts and CodeQL default setup

## Missing-premise gate

Passed. Present as built in 41-01..41-03: `scripts/verify-repo-controls.mjs` (now 17 controls, was 15), `verify-workflows.mjs`,
`apply-repo-controls.mjs`, the `repo-controls-self-test`, `workflows` and `zizmor` registry rows, and the settings bodies including
`private-vulnerability-reporting.json`. The plan was blocked on the Phase 48 sweep only in the sense of its ordering; the sweep merged in
`workspace/deploy` (merge `776ad725` into this branch) and nothing in this plan reads it.

## Adapting the plan to the Phase 48 sweep

The sweep (once per UTC day behind a 06:00 UTC gate, provenance-checked state artifact, issue selected by owner login plus the
`release-train` label) has six rows: runner-online, esr-pin-age, channel-liveness, watchdog-age, synthetic events POST,
download-count. None of them covers Dependabot or CodeQL, and none reads repo-controls; those rows are TRAIN-11 (a later plan), so this
plan does not touch the sweep, its state or its issue. One adaptation: both Dependabot ecosystems run Mondays at 04:00 UTC
(`timezone: Etc/UTC`), two hours before the sweep's daily gate, so that day's sweep already sees the grouped PR when TRAIN-11 adds the
open-PR count. A week with no updates opens no PR (Dependabot behaviour); nothing pages on empty.

## dependabot.yml

Keys: `version: 2`; `github-actions` at `/`, weekly, `groups.actions.patterns: ["*"]`, `open-pull-requests-limit: 5`; `npm` at `/theia`,
weekly, `open-pull-requests-limit: 0`. Schema source: the SchemaStore `dependabot-2.0.json` (fetched read-only 2026-10-31); the file
validates against it (ajv, strict off). No auto-merge key, no compound pin comment (0 hits), no `uses:` or `run:`, outside
`.github/workflows/`, so `workflows` (uses-admitted, no-schedule, event-text) is unchanged and green. `actions-selected.json` untouched.

## Probed endpoints (read-only, 2026-10-31)

```
gh api -H 'X-GitHub-Api-Version: 2022-11-28' repos/Deocracy/powerbrowser/vulnerability-alerts          -> 204 (on)
gh api -H 'X-GitHub-Api-Version: 2022-11-28' repos/Deocracy/powerbrowser/code-scanning/default-setup  -> {"state":"not-configured","languages":["actions","javascript","javascript-typescript","python","typescript"],"query_suite":"default","threat_model":"remote",...}
gh api -H 'X-GitHub-Api-Version: 2022-11-28' repos/Deocracy/powerbrowser/automated-security-fixes     -> {"enabled":true,"paused":false}
```

Writes (documented, not run): `PUT .../vulnerability-alerts` (bodiless), `PATCH .../code-scanning/default-setup` (the body file).

## Bodies, verbatim

`.github/settings/dependabot-alerts.json`: `{ "enabled": true }`.
`.github/settings/code-scanning-default-setup.json`: `{ "state": "configured", "languages": ["actions", "javascript-typescript"], "query_suite": "default" }`.
`actions` covers the workflow files; the live shape does not say more about Actions coverage.

## Self-test and dry-run

`node scripts/verify-repo-controls.mjs --self-test`: PASS, 68 planted faults red, 4 controls green. New plants: alerts 404, alerts 500,
a 204 on a control that did not opt in, default setup not configured, without `javascript-typescript`, another query suite, unreadable
endpoint; plus six `ghGet` cases through an injected exec (204, 404, 403, 500, non-JSON, JSON). Dry-run lines:
`19. PUT repos/Deocracy/powerbrowser/vulnerability-alerts (no body)` and
`20. PATCH repos/Deocracy/powerbrowser/code-scanning/default-setup (body: .github/settings/code-scanning-default-setup.json)`.
The one `BLOCKED:` line live (`release-tags`, bot App not installed) is pre-existing; the self-test's green fixture has none.

## Live read-back (pre-apply baseline)

`node scripts/verify-repo-controls.mjs` exits red, as expected before the owner's apply (59 problems, 58 older). The new lines:
`dependabot-alerts` matches (alerts are on); `code-scanning-default-setup: state is "not-configured" live but "configured" declared`.

## No new registry row

The extension rides the existing `repo-controls` (full tier) and `repo-controls-self-test` (quick) rows. `scripts/verify-platform.sh` is unchanged.

## Verification

Run in the main checkout of branch `dsh/phase-51`: `scripts/verify-platform.sh --quick` exit 0; `--only` workflows, workflows-self-test,
zizmor, release-asset-set, release-asset-set-self-test, release-train-maintenance-self-test, repo-controls-self-test PASS;
`node scripts/release-train.mjs --self-test` PASS.

## Owner commands (not run)

See BLOCKED.md items 11 and 12: the dry-run, the CodeQL PATCH (with the languages check afterwards), the read-back, and
`gh pr view <n>` then `gh pr merge --merge <n>` for the first grouped PR.

## Deviations and gaps

- The plan's `ghGet` stayed one function; it gained an optional `exec` argument (injection for the self-test) and two failure flags
  (`status`, `empty`), both inert unless a control opts in.
- Not guarded: `dependabot.yml` itself (T-51-10 rests on review) and the Dependabot security updates switch (BLOCKED item 12).
- Unverified until the owner applies: the language list GitHub reports once default setup is configured.
