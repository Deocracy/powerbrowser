---
phase: 48-error-telemetry-maintenance-sweep-and-watchdog-d
plans: [48-03, 48-04]
review_path: .planning/workstreams/deploy/phases/48-error-telemetry-maintenance-sweep-and-watchdog-d/48-03-04-REVIEW.md
fixed_at: 2026-10-31
iteration: 1
findings_in_scope: 21
status: partial
---

# Phase 48 plans 48-03 and 48-04: review fix report

Base: workspace branch merged first (commit 23d53677, the same-repository PR filter, is an ancestor of the branch).
Branch dsh/phase-48, clone /home/chris/gsd-workspaces/deploy/dsh/phase-48. Gates ran in that clone (the main checkout of
the phase branch, no worktree).

Where one commit carries several findings, the findings share one file and its self-test; the commit message names each.

## Findings

- BL-01 FIXED eaa0e0a3 (watchdog dedupe by bot author `app/github-actions` and fixed label `release-train-watchdog`, label created by the workflow; unset author skips the dedupe and alerts)
- WR-01 FIXED 9fc2be26 + a79da0cc (sweepDue takes the last accepted sweep; the lookup moved into sweep-clock; dry run ignores the swept-today half)
- WR-02 FIXED c4ba2250 + 9fc2be26 + 62c27be1 + 25ca6d13 (Worker answers `ok: stored N synthetic M`; probe green only on `ok: stored 1 synthetic 1`; BLOCKED item 6 corrected)
- WR-03 FIXED 4b522863 (continue-on-error on the mint, watchdog read and synthetic step; maintenance runs unless the probe was cancelled)
- WR-04 FIXED f88e01d3 (`--author "$OWNER_LOGIN" --label release-train`, `--limit 100`, empty list when OWNER_LOGIN is unset or malformed)
- WR-05 FIXED 9fc2be26 + 6ed9051f (a newer tag with no commit date makes esr-pin-age no-data; an unreadable date no longer fails the step)
- WR-06 FIXED 9fc2be26 (one isolated real-call plant per rule of selectStateArtifact and selectPinned; four tautological plants deleted; CLI glue run as a child node)
- WR-07 FIXED eaa0e0a3 (the watchdog's run: bodies run under bash with a stub gh; the JS twin is deleted; 23 plants including the reviewer's six)
- WR-08 FIXED 61cf12d8 (whole-envelope check, rejection positions, drill text scan, every capture through the Worker's handleEvents, 26 plants)
- WR-09 FIXED 9fc2be26 (CRLF and trailing whitespace normalised before the byte compare; CRLF and trimmed-newline controls)
- WR-10 FIXED 4b522863 (`status=success&event=schedule`, read error printed to the log)
- WR-11 FIXED 4b522863 + 25ca6d13 (deferred the Administration grant and runner count to Phase 49; one token, `actions: read`, `powerbrowser-updates` only; BLOCKED item 2 updated)
- WR-12 FIXED 61cf12d8 + 39ff97ba (armRewrite restores on SIGINT/SIGTERM/exit/failure; dirty-tree refusal; bundle-marker assertion before the page is driven)
- IN-01 FIXED 36b85ef2 (`actions: read` on report; sweep-clock also holds it; verify-workflows accepts it)
- IN-02 FIXED 36b85ef2 (`overwrite: true` on the state upload)
- IN-03 FIXED a79da0cc (runs and artifacts lookups use per_page=100)
- IN-04 FIXED 9fc2be26 (FIREFOX_ESR must match `^[0-9]+(\.[0-9]+){1,2}(esr)?$` else dropped; newlines stripped from every rendered evidence string)
- IN-05 NOT FIXED in part: the unused checkout and `contents: read` are dropped (eaa0e0a3); the 26-hour limit against a daily schedule (a run delayed more than about two hours turns watchdog-age red) and the 60-day schedule auto-disable are left, they are tuning decisions and a live-observation item for 48-05
- IN-06 FIXED 62c27be1 (`--max-time 20 --proto '=https'`, https:// assertion, secret in a 0600 header file via builtin printf, never on argv)
- IN-07 FIXED in part 61cf12d8 + eaa0e0a3: schedule trigger is parsed (string, list, mapping forms), UNCAUGHT_KEYS and REJECTION_KEYS are derived from the producer's ADMITTED_KEYS; NOT FIXED: the registry rows `release-train-logic-self-test` and `release-train-maintenance-self-test` still run the same command (the plan forbids a new flag; the maintenance row cannot go red independently)
- IN-08 FIXED 9fc2be26 + f88e01d3 (logins compare case-insensitively on both sides, an unset owner still selects nothing; the log says why no issue was selected)

## Mutation test (scratch copy, one rule deleted at a time)

Run in a copy under the session scratchpad, no tracked file touched.

- scripts/release-train.mjs: 39 mutations (event, path, status, conclusion, run branch, run repository, verified sha, artifact name, expiry, artifact branch, repository id, run link, sha equality, repoId validity, label, title, author, unset owner, stored.number, CRLF, trimEnd, undated no-data, advisory validation, newline strip, synthetic acknowledgement, sweep day compare, sweep hour, OWNER_RE, newly-red filter, exactly-one, patch-on-diff, 2xx, watchdog limit, stale days, draft, state-select catch, and others). 37 killed. 2 survived and are equivalent mutants: removing the `Number.isFinite` clause in `sweepDue` (a NaN compare is still "due") and `readStored` returning `{}` instead of null (the `stored.number` check rejects it the same way).
- scripts/verify-telemetry-live-delivery.mjs: 32 mutations (every analyzer rule, the tree guard, the bundle guard, signal restore and exit code, disarm, handler removal). 31 killed. 1 equivalent survivor: dropping `verdict.status !== 200 ||` (the body compare covers it).
- scripts/verify-watchdog.mjs: 23 plants, including the reviewer's six surviving mutations (inverted dedupe gate, removed dedupe, removed missing-run branch, OPEN=true to false, reversed age, inverted open gate, wrong runs path); all go red.
- scripts/verify-events-worker.mjs: 48 plants (2 new for the synthetic acknowledgement); all go red.

## Verification

Run in the clone, not in a worktree:

- `--self-test` of release-train.mjs, verify-watchdog.mjs, verify-telemetry-live-delivery.mjs, verify-events-worker.mjs: PASS.
- `scripts/verify-platform.sh --only` workflows, workflows-self-test, zizmor, release-train-logic-self-test, release-train-maintenance-self-test, watchdog, watchdog-self-test, events-worker, events-worker-self-test, tel06-error-delivery-live-self-test: PASS.
- `node scripts/generate.mjs --check`: PASS.
- `scripts/verify-platform.sh --quick`: exit 0, "verify-platform: PASS -- all checks passed".

## Not run live (unchanged from BLOCKED.md)

The full loopback drill, the sweep, the watchdog and the probe were not run live. Unverified assumptions to confirm at plan 48-05:
`gh issue list --author app/github-actions` matches the bot author of an issue created with GITHUB_TOKEN (override with
the `WATCHDOG_AUTHOR` variable if not); curl `-H @file` needs curl 7.55 or newer (the hosted runner has it); the Worker
with the synthetic acknowledgement must be deployed before the `synthetic events POST` row can be green; the workflow's
state-lookup shell (the compare loop) is still covered only through the selector's verified-sha rule, not by a shell harness.

_Fixed: 2026-10-31_
_Fixer: Claude (gsd-code-fixer)_
_Iteration: 1_
