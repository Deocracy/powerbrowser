---
phase: 43-release-train-skeleton-and-upstream-bump-automation-a
plan: 05
subsystem: infra
tags: [release-train, scheduler, cloudflare-worker, jwt, node-provenance, exit-test]
status: partial
requires:
  - phase: 43-release-train-skeleton-and-upstream-bump-automation-a
    provides: plans 43-01 to 43-04 (detector, state table, reconciler skeleton, Node provenance chain, bump PR jobs)
provides:
  - docs/RELEASING.md records for the scheduler clock, the JWT measurement (pending), the train skeleton contract, Node provenance and the calendar exit test
affects: [43-05 Task 2 owner checkpoint, Phase 48 watchdog, the first live bot PR]

actuals:
  tokens: 3999
  tasks: 1
  commits: 1
plan_head_before: a5f93b418e0632bbdb044f9341588594232facf6
plan_head_after: 2f0400adc2fef2578b1cc90ce09fc26589887d00
commits: 1

key-files:
  created: []
  modified:
    - docs/RELEASING.md

key-decisions:
  - "The JWT-mint CPU is recorded as 'pending owner tick measurement' with its procedure and fallback; no number is estimated (T-43-17)"
  - "The Worker scaffold in RELEASING.md names the repository by REPO_OWNER and REPO_NAME vars, because the tree uses both Deocracy and DeBIOS-Foundation for the organisation and the owner's Task 2 text names the latter"
  - "The skeleton contract records the seven Phase 43 job rows as built, not the plan's 'five Phase-A jobs'"

requirements-completed: []
duration: not recorded
completed: 2026-10-31
---

# Phase 43 Plan 05: Pre-checkpoint proof and the five RELEASING.md records Summary

Task 1 only: `docs/RELEASING.md` now records the hourly clock-only scheduler Worker with a scaffold reference, the pending JWT-mint measurement with its procedure, the release-train skeleton contract, the Node provenance chain and the calendar exit test, with fixture-backed dry-run evidence captured below. Task 2 (the owner checkpoint) was not executed.

Status: partial. Task 1 done; Task 2 not executed, by instruction. The plan is not complete and `requirements-completed` is empty on purpose: INF-03 and the exit test close only after the owner's steps and the calendar.

## What Task 1 changed

Commit `2f0400ad` adds 255 lines to `docs/RELEASING.md` and nothing else. Anchors, so later quotes can find them:

- `#### The scheduler clock (INF-03)` and `#### JWT-mint CPU measurement (INF-03)`, under `### Cloudflare upkeep`.
- `### The train skeleton contract (TRAIN-01, TRAIN-08)`, `### Node provenance (AUTO-04)` and `### The calendar exit test (Phase 43, ROADMAP criterion 1)`, at the end of `## Train stages after the bump PR merges`. `docs/BUILD.md` already points at the heading `Node provenance`, so that name was kept.

No existing heading was renamed. `docs/BUILD.md` needed no change: the manual gpg step is already gone from it.

## Dry-run evidence

All run from this worktree on 2026-10-31 over fixtures in the session scratchpad; none wrote to the tree, to GitHub or to Cloudflare.

- `node scripts/release-train.mjs --self-test`: `--self-test PASS -- 19 states set-equal to 19 fixtures, 63 planted faults went red naming their drift, and 61 controls stayed green`.
- `node scripts/detect-upstreams.mjs --self-test`: `--self-test PASS -- ... 12 planted faults went red naming their drift, and 4 controls stayed green`.
- `detect-upstreams.mjs --listing` over a tag file with pin `FIREFOX_153_5_1esr_RELEASE` plus a newer `FIREFOX_153_6_0esr_RELEASE`, a `_BUILD1` tag and a 175 tag: `PASS -- ... candidate FIREFOX_153_6_0esr_RELEASE (153.6.0) -> bump; uptake FIREFOX_175_0_0esr_RELEASE -> replay-only`, with the `_BUILDn` and 175 refusals named.
- `detect-upstreams.mjs --node-select` over a synthetic `index.json` (a v25, a v24.99.0 with linux-x64, a v24.98.0 without it, a v22): `node-version=v24.99.0`. `--node-shasum` over a synthetic `SHASUMS256.txt` with one malformed line returned the entry for the named file. The `gpgv` step itself runs only in the workflow and was not run here.
- `release-train.mjs --would-write FIREFOX_153_5_1esr_RELEASE FIREFOX_153_6_0esr_RELEASE '' ''`: `state=DETECTED action=bump`, rendering the tracking issue `release-train: v153.6.0-1` with its marker line, and printing that the writer is not wired.
- `node scripts/verify-workflows.mjs`: `PASS -- 7 workflow(s) ... rules enforced: ... dry-run-gate, bot-job-gate ...`; `--self-test`: `PASS -- 208 planted faults went red naming the file and job, and 11 controls stayed green`.

This proves validation, decision and render with no write at the logic and static-gate level. It is not a live dry-run dispatch of the workflow (a GitHub write, the owner's).

## --quick, recorded honestly

`scripts/verify-platform.sh --quick` from this worktree ended `verify-platform: FAIL -- see summary above`. Counting the summary section, 422 rows PASS and six are red, exactly the known worktree-environment set: `single-copy-deps`, `ng086-theia-react-node`, `gui07-strip-spike-verdict`, `gui07-strip-spike-verdict-self-test`, `gui09-dependent-window-content`, `gui09-dependent-window-content-self-test`. Every doc-sensitive row (`releasing-maintenance`, the residual-brand scan, the workflows rows) was green. That run began before two one-line wording fixes to the new text, so a final run on the committed tree is recorded under "Final verification" below.

This is NOT an all-green line and the plan's literal `--quick | tail -1 | grep PASS` acceptance check does not pass in this worktree for that reason alone. The authoritative green run is on the merged head in the main deploy worktree. The other automated-verify greps all pass: `powerbrowser-scheduler` 4 (needs 3), `dry-run` 9 (needs 2), `SHASUMS` 6 (needs 1), `return_run_details` 4, `10 ms` 3, `153.7 on 2026-11-10` 1, `User-Agent` 1.

## Task 2: not executed, owner steps

Task 2 is a `checkpoint:human-action` with `gate="blocking-human"`; every step is a live write. Owner steps, in dependency order:

1. Create the Cloudflare account, turn on 2FA, record the date.
2. Create the `powerbrowser-clock` App (Actions read and write, Metadata read-only, webhook off, installed on `powerbrowser` only; settings file `.github/settings/app-powerbrowser-clock.json`). Generate no key yet.
3. Create the empty public `powerbrowser-scheduler` repo; copy the scaffold from RELEASING.md; install `universal-github-app-jwt@2.2.2`.
4. Generate the App key once, convert with `openssl pkcs8 -topk8 -nocrypt`, store the PKCS#8 text as a Worker secret, shred the PKCS#1 download.
5. `wrangler deploy` to workers.dev, let it tick for a day, then read the invocation CPU times, compute median and p95, and replace the pending line in RELEASING.md with a dated one (verdict against 10 ms, fallback if over).
6. Wait for the calendar release (153.7 on 2026-11-10, else 153.8 on 2026-11-24). Record PR, run and issue links, or `exit-test: pending <date>`.
7. Also from phase BLOCKED.md item 2 (needed before the first live bot PR, not by this plan's Worker): install the bot App, set variable `BOT_APP_ID` and the `bot` environment secret `BOT_APP_PRIVATE_KEY`, create the `bot` environment, then dry-run the train.

The six-field reply, the JWT numbers and the exit-test links are not available; none is claimed here. This SUMMARY holds no key, secret or token.

## Deviations from Plan

None to code. Two recorded judgment calls, no Rule 1-4 fixes:

- The plan's "five Phase-A jobs" is recorded as the seven rows the skeleton has as built (derive, detect, detect-node, bump, the two bump-PR jobs as one row, report), with later phases' jobs named and pointed at their own sections.
- The exit-test record states two limits the plan did not: the issue leg cannot be observed until the live tracking-issue writer is wired (BLOCKED.md item 3), and an owner `reason=owner` dry run is itself a dispatch to list or make before the window.

## Known Stubs

The Worker scaffold in RELEASING.md is a reference that has not been run (stated in the text); the `send_email` binding and the `return_run_details` response status must be checked at deploy. Not a tree stub. The JWT line is intentionally pending.

## Threat Flags

None. No file besides `docs/RELEASING.md` changed, and no endpoint, auth path or schema was added to this tree.

## Final verification

Closing `scripts/verify-platform.sh --quick` on the committed tree (docs commit plus this SUMMARY staged), 2026-10-31: 422 rows PASS, six red, ending `verify-platform: FAIL -- see summary above`. The red rows are only the six known worktree-environment reds named above (`single-copy-deps`, `ng086-theia-react-node`, `gui07-strip-spike-verdict` and its self-test, `gui09-dependent-window-content` and its self-test). `fixer-isolate-self-test` passed. Not an all-green line; the authoritative green run is on the merged head in the main deploy worktree.

## Self-Check: PASSED

- `docs/RELEASING.md` exists and carries the five records (anchors above).
- Commit `2f0400ad` is an ancestor of HEAD.
- This file exists and holds no key, secret or token.
