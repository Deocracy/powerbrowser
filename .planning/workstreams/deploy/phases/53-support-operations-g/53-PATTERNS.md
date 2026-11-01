# Phase 53: Support operations (G) - Pattern Map

**Mapped:** 2026-10-23
**Files analyzed:** 14
**Analogs found:** 13 / 14

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|---|---|---|---|---|
| `.github/workflows/triage.yml` (NEW) | CI workflow | event → job → comment | `.github/workflows/notify-drill.yml` | exact |
| `scripts/verify-triage.mjs` (NEW) | test/gate | derive-and-compare | `scripts/verify-workflows.mjs` | exact |
| `scripts/verify-codeberg-mirror.mjs` (NEW) | test/gate | fixture + live compare | `scripts/verify-mar-update-hop.mjs` (live hop shape) | role-match |
| `scripts/verify-upptime.mjs` (NEW) | test/gate | fixture + live read | `scripts/verify-repo-controls.mjs` (live read + in-memory self-test) | role-match |
| `scripts/verify-bug-report.mjs` (NEW) | test/gate | derive-and-compare | `scripts/verify-shell-error-copy.mjs` | exact |
| `scripts/verify-releasing-support-ops.mjs` (NEW) | test/gate | derive-from-tree doc gate | `scripts/verify-rebranding-docs.mjs` | exact |
| `scripts/verify-platform.sh` (MOD: 5 rows + 5 self-test rows) | config/registry | - | rows at lines 4716-4730 (`workflows`, `zizmor`) | exact |
| `.github/settings/actions-selected.json` (MOD: admit claude-code-action) | config | admission set | itself | exact |
| `theia/extensions/branding/src/browser/powerbrowser-report-bug-contribution.ts` (NEW) | Theia contribution | command → stock window | `theia/extensions/tab-uris/src/browser/browser-window-command.ts` | exact |
| `theia/extensions/branding/src/browser/powerbrowser-frontend-module.ts` (MOD: bind contribution) | Theia module | DI binding | itself lines 9-28 | exact |
| `systemd/codeberg-mirror.{service,timer}` or `docs/`-drafted unit (NEW) | host unit | timer → push | `docs/RELEASING.md` runner unit precedent | role-match |
| `docs/RELEASING.md` (MOD: support-operations section) | doc | derived section | `docs/RELEASING.md` maintenance section + `releasing-maintenance` row | exact |
| `docs/RENEWALS.md` (MOD: triage/Codeberg rows, assumed Phase 42 file) | doc | date rows | DOC-04 `renewals` structure row | role-match |
| Upptime repo shape (`powerbrowser-status`) | external repo | poll → Pages | none (created by owner from template) | no analog |

## Pattern Assignments

### `.github/workflows/triage.yml` — copy `notify-drill.yml`

Header comment (lines 1-9): what the workflow is, who runs it, why it is kept. Then:
```yaml
name: Triage new issues
on:
  issues:
    types: [opened]
permissions:
  issues: write
concurrency:
  group: triage
jobs:
  triage:
    runs-on: ubuntu-latest
    environment: triage
    timeout-minutes: 10
    steps:
      - uses: actions/checkout@<40-hex> # vX.Y.Z
        with:
          persist-credentials: false
      - uses: anthropics/claude-code-action@db77d4d3c98f3f6380e7cd45ffba2342a3dbde3c
        with:
          model: claude-haiku-5-5
          path_to_claude_code_executable: <exact version install step>
          show_full_output: false
          allowed_non_write_users: "*"
```
No `schedule:`, no `pull_request`, no legion label, no `secrets.` in triage-adjacent jobs, no event text in `run:`/`prompt:`, no close step. Non-AI post step applies labels + fixed template text.

### `scripts/verify-triage.mjs` — copy `scripts/verify-workflows.mjs`

Header comment: rules made precise (GH-03 shape + FIX-08 pins). Instrument: same js-yaml via createRequire from `theia/`. Core: `runChecks(root, overrides)` with in-memory `overrides.read` so the self-test plants faults without touching the tree; tracked set from `readdir` of `.github/workflows/`. Failure strings name file and job and end `Next step: ...`. `main`: `--self-test` dispatch, clean-control green first, each plant red naming the drift, `process.exit(main())`.

Plants (each red naming file/job): missing `issues: opened`; missing/wrong `environment: triage`; non-Haiku model; missing `allowed_non_write_users: "*"`; widened `issues: write` (job or workflow effective); missing `concurrency: group: triage`; tag-object pin (`...@c335fd6d`); missing `path_to_claude_code_executable`; `show_full_output: true` (or absent-is-true); bare `Bash` in `allowedTools` (or any `run:`); `ACTIONS_STEP_DEBUG` set; event text in `prompt:`/`run:`; close-issue step (`gh issue close` / `state: closed`); `allowed_bots: '*'`.

### `scripts/verify-bug-report.mjs` — copy `scripts/verify-shell-error-copy.mjs`

Derive from the contribution source: the prefill param set, the opener call, the clipboard call. Compare as set equality: prefill ⊆ `bug.yml` field ids (read-and-fail-closed if Phase 42 forms absent); origin+path vs manifest `release_notes` (same derivation the manifest comparand uses); `github.com` row `user-initiated`. Self-test plants: a `diagnostics=`/`body=` query param (red naming the file); an origin mismatch; an extra prefill id not in `bug.yml`.

### `scripts/verify-codeberg-mirror.mjs` / `scripts/verify-upptime.mjs` — copy live-read halves

In-memory fixture self-test (lagged SHA red naming the mirror; dropped Upptime target red; disabled-workflow fixture red) plus full-tier live halves (`codeberg-mirror-live`: unauthenticated Codeberg `main` SHA vs `gh api` GitHub `main` SHA; `upptime-sweep-live`: Upptime workflow enabled + last-run age). Live-missing is FAIL, never SKIP.

### `scripts/verify-releasing-support-ops.mjs` — copy `scripts/verify-rebranding-docs.mjs`

Derive every documented trigger/job-id/template-id from the workflow files at check time; require each as inline code; plants (removed trigger, renamed job, deleted template, missing CodeQL-after-rebase/moderation/fork-approval rule) each red naming the removal.

### `scripts/verify-platform.sh` registry rows

```sh
    # NEW (Phase 53, REQ-ID): <what it derives and compares; quick or full tier>.
    # The self-test rides alongside for the reason every other self-test row gives.
    "triage-workflow|node $REPO_ROOT/scripts/verify-triage.mjs"
    "triage-workflow-self-test|node $REPO_ROOT/scripts/verify-triage.mjs --self-test"
    "bug-report-affordance|node $REPO_ROOT/scripts/verify-bug-report.mjs"
    "bug-report-affordance-self-test|node $REPO_ROOT/scripts/verify-bug-report.mjs --self-test"
    "codeberg-mirror|node $REPO_ROOT/scripts/verify-codeberg-mirror.mjs"
    "codeberg-mirror-self-test|node $REPO_ROOT/scripts/verify-codeberg-mirror.mjs --self-test"
    "upptime-config|node $REPO_ROOT/scripts/verify-upptime.mjs"
    "upptime-config-self-test|node $REPO_ROOT/scripts/verify-upptime.mjs --self-test"
    "releasing-support-ops|node $REPO_ROOT/scripts/verify-releasing-support-ops.mjs"
    "releasing-support-ops-self-test|node $REPO_ROOT/scripts/verify-releasing-support-ops.mjs --self-test"
```
Quick rows honestly quick (text reads + in-memory fixtures). Live halves (`codeberg-mirror-live`, `upptime-sweep-live`) registered inside the full-tier guard; `repo-controls` already covers env/label/flag read-back.

### TEL-05 contribution — copy `browser-window-command.ts`

`theia/extensions/tab-uris` GUI-01 precedent: `window.open(target, '_blank')` fallback when the shell channel is down, else the opener command. Contribution registers `PowerBrowser: Report a Bug` in the command palette; version/OS/install-format from the identity surface (same values `application.ini` Name/Vendor lines back); diagnostics via `navigator.clipboard.writeText`, never in the URL. Bind in `powerbrowser-frontend-module.ts` next to the welcome bindings (guarded rebind idiom D-35 unchanged).

## Shared Patterns

- **Message format:** `<name>: PASS|FAIL|SKIP -- <plain statement>`; each failure ends `Next step: ...`; exit 0/1, 2 for bad args.
- **Derive, never hand-keep:** expectations from `configuration.toml` via `scripts/lib/toml.cjs`, `labels.json`, `ISSUE_TEMPLATE/*.yml`, workflow files, `git ls-files`; set equality catches addition and removal.
- **Self-test:** green baseline first, in-memory or mkdtemp plants, red must name the drift, unplanted control stays green.
- **Stage new files** before trusting `scan-brand-residue.mjs` (git ls-files based); new self-test fixtures must not spell brand tokens or tag literals.
- **No `COUNT MOVED` without movement:** brand-tokens moves count only files actually moved.

## No Analog Found

| File | Reason |
|---|---|
| Upptime repo (`powerbrowser-status` from template) | Created by the owner outside this tree; plans only declare its target set and sweep contract |

## Metadata

**Analog search scope:** scripts/, .github/workflows/, theia/extensions/branding/, theia/extensions/tab-uris/
**Files scanned:** 6
**Pattern extraction date:** 2026-10-23
