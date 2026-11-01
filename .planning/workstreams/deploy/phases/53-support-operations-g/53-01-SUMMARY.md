# Phase 53 Plan 01: Report-a-Bug command and triage row in fixture mode - Summary

**The palette command builds a four-key bug.yml prefill URL through the GUI-01 opener, and the triage row proves the declared GH-03 shape on a checked-in fixture, including a planted-instruction run of the workflow's own post step.**

## Performance

- **Tasks:** 2 of 2 complete
- **Commits:** `e8d5468` (Task 1), `c6a8e31` (Task 2)
- **Gate:** `scripts/verify-platform.sh --quick` exit 0 before the plan (baseline "verify-platform: PASS -- all checks passed") and exit 0 after both commits.

## What was built

- **Contribution command:** id `powerbrowser.report-bug`, label `PowerBrowser: Report a Bug`, in `theia/extensions/branding/src/browser/powerbrowser-report-bug-contribution.ts`. It builds `URLSearchParams` with exactly four keys (`template`, `version`, `os`, `install_format`) and executes the GUI-01 opener id `powerbrowser.open-browser-window`. No diagnostics key is ever in the URL.
- **Binding:** one `bind(CommandContribution).to(PowerBrowserReportBugContribution).inSingletonScope()` line in `theia/extensions/branding/src/browser/powerbrowser-frontend-module.ts`, beside the welcome bindings. The D-35 guarded rebind is unchanged.
- **Triage fixture:** `scripts/fixtures/triage-good.yml`, the full permitted GH-03 shape: issues opened, triage environment, ubuntu-latest, timeout 10, checkout pinned at v4.4.0 with credentials off, claude-code-action pinned at commit `db77d4d3c98f3f6380e7cd45ffba2342a3dbde3c`, Claude Code 2.1.304 through `path_to_claude_code_executable`, model `claude-haiku-5-5` in `claude_args`, `show_full_output: false`, star `allowed_non_write_users`, and a non-AI post step that reads model output through `env:` only.
- **Triage row:** `scripts/verify-triage.mjs`, fixture mode in this plan.
- **Bug-report row:** `scripts/verify-bug-report.mjs`.

## Verification results

- `node scripts/verify-triage.mjs`: PASS, naming `scripts/fixtures/triage-good.yml`. The planted-instruction proof runs the post step under `bash --noprofile --norc` with a stub `gh` and a hostile model output. The only calls are allow-listed label edits and one literal comment, with no close.
- `node scripts/verify-triage.mjs --self-test`: green control first, then 21 planted faults, each red naming the file, job and rule. Covered: missing `issues: opened`, `environment: release`, missing environment, non-Haiku model, missing `allowed_non_write_users`, contents widened to write, missing concurrency group, tag-object pin, missing `path_to_claude_code_executable`, `show_full_output: true`, `show_full_output` absent, bare `Bash`, `ACTIONS_STEP_DEBUG`, `allowed_bots`, event text in the prompt, interpolation in a run body, a close-issue step, a label outside `labels.json`, the post step removed, the label filter removed (planted instruction), and a raw model template id posted (planted instruction).
- `node scripts/verify-bug-report.mjs`: PASS. The prefill keys version, os and install_format are a subset of the bug.yml field ids, the target agrees with `urls.release_notes`, the opener is the GUI-01 id, and github.com is `user-initiated`.
- `node scripts/verify-bug-report.mjs --self-test`: green control, then 6 planted faults, each red naming the drift: diagnostics-bearing query key, origin mismatch, extra prefill id, absent Phase 42 form, respelled opener id, widened github.com disposition.
- `npx tsc --noEmit -p .` in `theia/extensions/branding` under `nix develop .#theia`: exit 0.
- `scripts/scan-brand-residue.mjs`: PASS over 448 scanned files.

## Registry rows

The four rows sit in the quick array, the first two after `zizmor-self-test`, the last two after them:

- `triage-workflow`
- `triage-workflow-self-test`
- `bug-report-affordance`
- `bug-report-affordance-self-test`

`--only workflows` and `--only endpoint-dispositions-self-test` each exit 0.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Brand residue gate red on the owner-slug occurrences**
- **Found during:** the Task 2 quick gate
- **Issue:** The contribution and its verifier spell `Deocracy/powerbrowser`, the owner-ruled release-home slug. The coincidental row in `inventory/brand-tokens.json` lists its files by name, so the two new files were residue.
- **Fix:** Added both files to that row's `expected_files` and `only_in`, moved `expected_count` 27 to 30, and recorded the count move in the row's reason. Task 1 carried the contribution's share (27 to 28) and Task 2 carried the verifier's share (28 to 30).
- **Owner review:** This follows the 2026-10-29 ruling. The alternative is a `[urls].issues` key through the generator, which this plan does not own.

**2. [Rule 3 - Blocking] Planted-instruction proof needed a profile-free bash**
- **Found during:** the first triage self-test run
- **Issue:** The NixOS login profile rewrites PATH, which put the real `gh` ahead of the stub, and `spawnSync('bash')` could not resolve `bash` through the restricted PATH.
- **Fix:** The proof resolves bash from the parent PATH and runs it with `--noprofile --norc`.

### Gaps against the plan (recorded, not hidden)

- **install_format has no in-tree source.** The Theia frontend cannot reach the chrome-side identity surface (`getAppIdentity`). The field is sent empty so the reporter fills it. Shortcut recorded in the contribution: upgrade when the shell publishes the install channel to the sidecar.
- **version comes from `ApplicationServer.getApplicationInfo()`**, the surface the About dialog already shows, read once at construction so the click path keeps its user activation. The plan named the chrome identity surface, which the frontend cannot call.
- **No diagnostics Copy button was added.** The clipboard path belongs to the diagnostics layer and was not part of this contribution. The URL carries no diagnostics key by construction, and the row reds any such key.

### Carried assumptions (verified in 53-02, not here)

- The `--tools ""` and `--json-schema` flags in `claude_args` are the carried structured-output shape. They are proven by the owner's live planted-issue drill at the 53-04 checkpoint, not by this row.

## Known Stubs

None.

## Threat Flags

None beyond the plan's threat model. The contribution opens only the github.com issues form, and its query string carries only the four keys.

## Self-Check: PASSED

- Files created and modified exist in the tree (`theia/extensions/branding/src/browser/powerbrowser-report-bug-contribution.ts`, `scripts/verify-triage.mjs`, `scripts/verify-bug-report.mjs`, `scripts/fixtures/triage-good.yml`).
- Commits `e8d5468` and `c6a8e31` are on `dsh/phase-53`.
- The quick gate passed after both commits.
