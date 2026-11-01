---
phase: 50-release-train-stages-and-first-public-linux-release-e
plan: 03
subsystem: release-pipeline
status: partial
tags: [release, withdraw, channel-live, rel-02, upd-16]
requires:
  - 50-02
  - 49-04 (scripts/verify-channel-live.mjs, tree-derived manifest claims, Release-asset manifest)
provides:
  - scripts/verify-channel-live.mjs --withdrawn <tag> (expectation flip, runWithdrawnChecks, NO_UPDATE_XML)
  - docs/RELEASING.md section "The liveness row after a withdrawal" with the expected post-withdraw output
affects:
  - scripts/verify-channel-live.mjs
  - docs/RELEASING.md
key-files:
  modified:
    - scripts/verify-channel-live.mjs
    - docs/RELEASING.md
decisions:
  - "Withdrawn mode asserts the no-update document byte for byte; it does not accept a descriptor that points at a previous good release. The plan and the 2026-10-29 owner ruling make withdraw no-update only."
  - "The mode reads the manifest of the withdrawn tag (--manifest, else the release-manifest.json asset of the Release at that tag), never the latest Release, because the latest Release moves when the pre-release flag sticks."
  - "No MAR origin is read in withdrawn mode; the self-test counts MAR requests and requires zero."
metrics:
  completed: 2026-10-31
actuals:
  tokens: 14000
  tasks: 1
  commits: 1
plan_head_before: a5f93b418e0632bbdb044f9341588594232facf6
plan_head_after: 72edb140363a3cc969e5a45d79a5ad42c4cde71d
---

# Phase 50 Plan 03: Withdraw path, Task 2 only Summary

Task 2 landed: `scripts/verify-channel-live.mjs --withdrawn <tag>` asserts that every public update.xml is the no-update document and equals its updates repo copy, with the expectation flip proven in both directions by the self-test. Tasks 1 and 3 were not executed by instruction. The plan stays open (status partial).

## Task status

| Task | Name | Status |
| ---- | ---- | ------ |
| 1 | withdraw.yml spec in docs/RELEASING.md | NOT EXECUTED (checkpoint, tied to the owner's review) |
| 2 | channel-live `--withdrawn` plus flip self-test | DONE, commit 72edb140 |
| 3 | Immutable-release probe | NOT EXECUTED (owner-only `checkpoint:human-action`, `gate="blocking-human"`) |

## What Task 2 delivered

- `--withdrawn <tag> [--manifest <path>]`. Per BUILD_TARGET it fetches the descriptor through the baked 11-segment path and requires HTTP 200, bytes exactly equal to `NO_UPDATE_XML` (`<?xml version="1.0" encoding="UTF-8"?>\n<updates></updates>\n`), and byte-equality with the updates repo copy. It reads no MAR origin.
- The tag must match the release-key form and the manifest's `release_key` must equal it, both refused before any request. The manifest's `mar_origin`, `update_channel` and `update_url` still go through `treeAuthority` (the tree decides).
- Without `--manifest`, the manifest comes from the `release-manifest.json` asset of the Release at the tag (`releases/tags/<tag>`), so it works whether the pre-release flag or the notes-only mark was used.
- Option parsing: `--withdrawn` takes a value and is rejected alongside `--self-test`, `--form-only`, `--manifest-agrees` and `--descriptors`.
- Small refactor shared by both modes: `manifestFromFile`, `manifestFromRelease`, `repoCopyProblem`. The default mode keeps its text and behavior; all 33 original ok lines are unchanged.
- `docs/RELEASING.md`: new section "The liveness row after a withdrawal (`--withdrawn`)", before "Train stages after the bump PR merges". It quotes the expected `--withdrawn PASS` line verbatim, the red subchecks, and states that the default run is expected red after a withdraw, with its first problem line.

## Flip proof (self-test, 14 new ok lines)

| Direction | Result |
| --------- | ------ |
| release bytes, default mode | green (existing baseline) |
| no-update bytes, `--withdrawn` | green, zero MAR requests |
| release bytes, `--withdrawn` | red naming the target, "still offers an update (1 patch element(s))" and the tag |
| no-update bytes, default mode | red naming the target and "does not carry the descriptor shape" |

Further plants, each red naming the target and the value: no trailing newline, `<updates/>` spelling, an update element without a patch, a missing target file, an updates repo copy still holding the release descriptor. Refused before any request: a non-release-key tag (`../../contents/evil`), a manifest naming another release, a manifest `mar_origin` off the tree. From the Release asset: green at the tag, red on a 404 tag, red on a Release without the manifest asset.

## Results

- `node scripts/verify-channel-live.mjs --self-test`: PASS, 47 ok lines (was 33; 14 added).
- `scripts/verify-platform.sh --only channel-live-self-test`: PASS.
- `scripts/verify-platform.sh --quick` (run before the commit, final tree has no later code change): red rows are exactly the six known worktree-environment reds: single-copy-deps, ng086-theia-react-node, gui07-strip-spike-verdict, gui07-strip-spike-verdict-self-test, gui09-dependent-window-content, gui09-dependent-window-content-self-test. Every other row green.
- `node scripts/scan-brand-residue.mjs` after staging: PASS (553 files).

## Deviations from Plan

### Auto-fixed Issues

None needing a fix. Notes on departures from the plan text:

1. **File name.** The plan names `scripts/verify-update-channel-live.mjs`; the landed Phase 49 script is `scripts/verify-channel-live.mjs` (registry rows `channel-live`, `channel-live-self-test`). The flag went into the landed file, and the runbook section states the real name. docs/RELEASING.md step 7 still mentions the old name and the row name `update-channel-live`; left alone as out of scope (not caused by this task).
2. **Registry.** No new row: the existing `channel-live-self-test` row runs the extended self-test, so `scripts/verify-platform.sh` is unchanged.
3. **Previous-good-release descriptor.** The coordinator's message allowed "point at the previous good release, or carry no update". The plan, its must_haves and the 2026-10-29 ruling say no-update only and never a repoint, so only no-update is accepted. Accepting a repoint would be a one-branch change if the owner reverses the ruling.
4. **Commit trailer.** The plan asks for the `Muse Spark 1.3 (DSH)` trailer; this commit was made by Claude and carries `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`.

## Dependencies on Task 1 (not executed)

- withdraw.yml must call `node scripts/verify-channel-live.mjs --withdrawn "$TAG"` (tag via env, never event text) and use the same `NO_UPDATE_XML` bytes. The updates repo has no manifest-less copy of this script, so the job must check out the product repo at the tag, or carry the script as a staged file. The runbook section describes the mode but does not yet contain the withdraw.yml spec or the placement and token text from Task 1's acceptance criteria.
- The updates repo existence was not established from this worktree (a read-only `git ls-remote` was inconclusive). Record MISSING with its SPEC section when Task 1 runs.

## Owner steps for the unexecuted tasks

- Task 1: review and approve the withdraw.yml spec (workflow_dispatch, inputs `tag` and `reason`, no mode input, hosted runner, SHA-pinned uses, App token minted just before use with contents write on `powerbrowser-updates` and `powerbrowser`, no-update commit per manifest-derived target, `--withdrawn` rerun, marking per the probe). Then land it in `powerbrowser-updates` when that repo exists.
- Task 3: before the first public release, run the immutable-release probe on a throwaway or `-probe` Release (PATCH `prerelease=true` with the bot token, then a notes append), and record date, tag, which branch stuck and any exact 422/403 text in docs/RELEASING.md. Never delete the probe Release or tag.

## Known Stubs

None.

## Threat Flags

None. The new mode only reads (public HTTPS GETs and `gh api` GETs) and writes nothing.

## Self-Check: PASSED

- scripts/verify-channel-live.mjs and docs/RELEASING.md present and modified in commit 72edb140 (verified with `git merge-base --is-ancestor 72edb140 HEAD`).
- STATE.md, ROADMAP.md and requirement checkboxes were not advanced: the plan is partial, with Tasks 1 and 3 outstanding.
