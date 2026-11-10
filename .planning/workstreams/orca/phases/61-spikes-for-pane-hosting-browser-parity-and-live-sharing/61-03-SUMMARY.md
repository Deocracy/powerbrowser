---
phase: 61-spikes-for-pane-hosting-browser-parity-and-live-sharing
plan: 03
subsystem: spikes
tags: [ext-03, orca, orcad, claude-code, extension, resume, background-session, orca-lane, spike-006]
requires:
  - phase: 60-orca-from-source-on-theia-s-node
    provides: scripts/build-orca.sh, scripts/lib/orca-run.mjs, the CLI build steps and the short-profile rule (60-EXT01-RECORD notes 1-3)
provides:
  - "Spike 006 record .planning/spikes/006-orca-live-sharing/ (README.md, results.md, floor-run.mjs, results-floor.json, extension-notes.md)"
  - "Floor proven by run: a Claude session started by PB's orcad, stopped, resumed with claude --resume"
  - "Route for Phase 63 and the P61-07 fallback recommendation"
affects: [61-04 (MANIFEST row 006, ROADMAP Phase 63 route line, STATE deferred row, skill wrap-up), 63 (Theia terminals and agent hooks, EXT-02), end-of-milestone pass (EXT-01 session)]
status: complete
actuals:
  tokens: 12900
  tasks: 3
  commits: 3
plan_head_before: 132f2f53732f8d54626317e71ceab6ae045f12d9
plan_head_after: the commit that adds this file (its own hash cannot be written inside it)
key-files:
  created:
    - .planning/spikes/006-orca-live-sharing/floor-run.mjs
    - .planning/spikes/006-orca-live-sharing/results-floor.json
    - .planning/spikes/006-orca-live-sharing/extension-notes.md
    - .planning/spikes/006-orca-live-sharing/results.md
    - .planning/spikes/006-orca-live-sharing/README.md
    - .planning/workstreams/orca/phases/61-spikes-for-pane-hosting-browser-parity-and-live-sharing/61-03-SUMMARY.md
  modified: []
key-decisions:
  - "The floor ran in the registered repo's own checkout (--worktree path:<repo> resolved), so no Orca worktree was created under ~/orca/workspaces"
  - "The claude resume ran with every ORCA_* variable removed as well as the Claude session markers, so its hooks could not report to the owner's running Orca"
  - "The session file search opens only the project directory that encodes the run's own cwd; no other session is read"
  - "floor-run.mjs has a --dry-run mode that stops before the launch, so the harness can be re-checked without a model turn"
requirements-completed: [EXT-03]
duration: about 1 h
completed: 2026-11-09
---

# Phase 61 Plan 03: spike 006, live sharing (EXT-03) Summary

**The floor is proven by one autonomous run: a Claude agent session started by PowerBrowser's
own orcad was stopped and then resumed with `claude --resume`, repeating its marker. The Claude
Code extension's package offers three resume-by-id entry points and no attach. Phase 63 has a
route that does not wait for the deferred extension check.**

VERDICT: YELLOW — the floor is proven on the CLI and Phase 63 has a route; three conditions apply.

Route for Phase 63: agent sessions are Theia terminals running the plain `claude` CLI, reopened on demand with `claude --resume <session id>` (the P61-07 fallback), with the session id taken from Claude's side; the background-attach option (`claude --bg` plus `claude attach`) stays open as an unproven optional investigation and is not promised.

Deferred human item: EXT-03 extension half (a stopped Orca session resumed inside the Claude Code extension on Theia), to run with the EXT-01 session in the end-of-milestone pass (D-18); steps are in `.planning/spikes/006-orca-live-sharing/README.md`, section "Blocked on EXT-01".

Merge note for the coordinator: spike directory only; no registry rows; no brand-token rows; no WINDOWS.md ids.

## The three YELLOW conditions

1. The extension half of the floor is not run; it waits for EXT-01 (D-18).
2. At 2.1.321 the extension resumes by id and has no attach, so a running Orca agent cannot be
   shared live inside it as far as its source shows.
3. The background-session option is half proven (start, list, stop without a terminal); attach
   from a second client is unproven and must not be promised in ROADMAP text.

No owner decision is needed for Phase 63 to be planned.

## Tasks and commits

| Task | Commit | Files |
|---|---|---|
| 1. Floor run | `de9da6b7` | `floor-run.mjs`, `results-floor.json` |
| 2. Extension entry points and launch-mode study | `4dca4b35` | `extension-notes.md`, `results.md` |
| 3. Record, verdict, route, this SUMMARY | the commit that adds this file | `README.md`, `61-03-SUMMARY.md` |

## What was measured

- Floor (`results-floor.json`): session `468b096a-bd9b-4a24-add3-d287c0da03bb`; agent
  processes 1 → 0 after `terminal close --all`; jsonl 57 → 86 lines on resume;
  `resumeOutputHasMarker: true`; resume exit 0; launch to answer 8.0 s, resume 8.6 s; 28
  inherited variable names removed; `~/.claude/settings.json` unchanged.
- Extension (`extension-notes.md`): vsix sha256 matched; `"--resume"` 3 and 2 occurrences,
  `"--bg"` 0, `"--background"` 0, `"attach"` 0 as a CLI argument, `claude attach` 0, across
  `extension.js` and `webview/index.js`.
- Launch modes (`results.md` rows 5-8): `claude --resume <id> --bg` backgrounded the floor
  session under the same id with no model turn; `claude agents --json` listed it;
  `claude stop 468b096a` stopped it and it was no longer listed; `claude attach` not run.

## Findings for later phases

- Assumption A7 is false: `orca terminal list --json` does not expose the Claude session id.
  Phase 63 takes the id from Claude's side.
- `claude agents --json` lists interactive sessions too, with `sessionId` and `cwd`: a discovery
  channel for a running Orca agent.
- A background job is addressed by an eight-character job id, not the full session id.
- The owner's user-level hooks run in every launched and resumed session (57 jsonl records for
  a one-line prompt); checks must compare counts before and after, never against a constant.

## Deviations from the plan

1. **Task 1 verify was not re-executed as written.** Its first automated command runs
   `floor-run.mjs` again, which would be a second exchange on the owner's login, against the
   plan's own "one floor exchange" truth. The PASS line was checked from the captured output of
   the single run and the JSON assertions were run against the committed `results-floor.json`.
   The second automated command (no tracked jsonl, no orcad left running) was run as written.
2. **Added `--dry-run`** to `floor-run.mjs` (stops before the launch). Two dry runs were used
   to prove the harness before the one real run; the first exposed a missing verdict line,
   fixed before any model turn was spent.
3. **Resume environment is stricter than the plan's "base environment":** every `ORCA_*`
   variable is removed for the resume as well, not only the Claude session markers.
4. **`results-floor.json` has seven keys beyond the plan's list** (`workspace`,
   `launchOutcomeKind`, `sessionDirectory`, `agentProcessesBeforeStop`,
   `agentProcessesAfterStop`, `resumeExitCode`, `claudeSettingsChanged`). All are counts, names
   or booleans; none holds transcript text.
5. **Background study, first stop attempt failed** (`claude stop` with the full session id:
   "No job matching"). The job stayed listed for a few minutes until `claude stop 468b096a`
   stopped it. Recorded in `results.md` (control row) and the README trail.
6. **Setup:** `scripts/build-orca.sh` does not build the Orca CLI; it was built with the two
   steps from 60-EXT01-RECORD note 3. `git -C orca status` stayed clean.

## State left on the host

- `~/.claude/projects/-home-chris-orca-workspaces-Power-Browser-p61-03--mozbuild-p61-03-floor-f529c335/`
  (the floor session, the owner's data, left in place by design). The session also remains in
  `claude agents --json --all` as a stopped background job; `claude rm 468b096a` removes that
  entry and was not run.
- `~/.cache/pb-p61-03-orca` (symlink to the lane's ignored `.mozbuild/p61-03/powerbrowser-orca`).
- No orcad, terminal daemon, agent or background session from this lane is running.
- The owner's memory and session hooks ran inside the two floor turns; anything they recorded
  from those turns is outside this lane's control.

## Checks run

- `floor-run.mjs`: PASS (one run); JSON assertions pass; no tracked `.jsonl`; no orcad running.
- Task 2 verify commands: both pass (sha256, entry points, 8 numbered rows, no package file tracked).
- Task 3 verify: one `Route for Phase 63:` line, verdict line starts `YELLOW`, sections present.
- `node scripts/scan-brand-residue.mjs` with the spike files staged: PASS, exit 0.
- Credential grep over the spike directory: no match.
- Lane diff against the base branch has no path outside `.planning/`.
- Not run: `scripts/verify-platform.sh --quick` (the lane adds no script, registry row or
  tracked file outside `.planning/`).
