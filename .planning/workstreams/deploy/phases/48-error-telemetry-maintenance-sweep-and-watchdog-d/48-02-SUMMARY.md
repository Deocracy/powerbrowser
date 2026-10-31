---
phase: 48-error-telemetry-maintenance-sweep-and-watchdog-d
plan: 02
subsystem: telemetry
tags: [tel-10, tel-11, cloudflare-worker, d1, download-counts, retention, verification-gate]

# Dependency graph
requires:
  - phase: 48-01
    provides: the producer's ADMITTED_KEYS (telemetry-enrichment.ts), which the Worker's set must equal
provides:
  - Zero-dependency telemetry Worker with POST /events (validate, cap, store to D1) and POST /download-counts (Bearer secret, upsert per asset and day)
  - Daily scheduled delete of rows older than 30 days from both tables
  - D1 DDL for the events and download_counts tables
  - Deploy descriptor with the owner runbook (no secret, no routes key)
  - Contract gate with a planted fault per rule, registered as events-worker and events-worker-self-test
  - Two docs/RENEWALS.md rows for the Worker secret and the bot environment copy
affects: [48-03 maintenance sweep (download-count route and no-data state), 48-05 owner deploy (D1 create, schema apply, secret put, deploy, rate-limit rule, synthetic POST)]

# Actuals (#2632) -- chars/4 over the post-plan content of the 6 files changed by this plan.
actuals:
  tokens: 87079
  tasks: 2
  commits: 2

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Stub D1 that models only the statement shapes the Worker issues and throws on any other, so a new statement fails the gate"
    - "Behaviour gate by mutation: each planted fault is a one-line change to a copy of the Worker, and the gate must go red naming the rule"
    - "Worker derives its literals from exports; the gate reads the producer's ADMITTED_KEYS and the privacy page's retention, so no number is kept twice"

key-files:
  created:
    - worker/events-worker.mjs
    - worker/schema.sql
    - worker/wrangler.toml
    - scripts/verify-events-worker.mjs
  modified:
    - scripts/verify-platform.sh
    - docs/RENEWALS.md

key-decisions:
  - "compatibility_date = 2026-10-31 (the date this file was written)."
  - "The events table keeps synthetic as a control flag: the sweep's probe sets synthetic true, the Worker reads it as a boolean and stores 0 or 1, and never stores it as payload. TEL-10 says drop every property outside the admitted set, which would otherwise drop the probe marker that the maintainer query needs. Resolved in favour of the marker, and recorded here for the owner to confirm."
  - "Rejections use the body Discarded: <reason> (colon form, as the plan's vocabulary states). 200 accepted: ok: stored <n> or ok: <asset>. 401 and 404 answer an empty body."
  - "Authentication is checked before the body is sized or parsed on the download-count route; the secret compare is constant-time and fails closed when the secret is unset."
  - "The /events throttle is a per-instance window of 60 accepted POSTs per 60 seconds; the Cloudflare rate-limit rule (owner, plan 48-05) is the real per-IP budget."
  - "The maintainer query is SELECT * filtered on synthetic = 0, ordered by id."
  - "Retention is a single scheduled export, daily at 03:00 UTC, deleting rows with received_at older than RETENTION_DAYS from both tables."

patterns-established:
  - "Contract gate control first: the unmutated Worker must answer every rule before any plant is trusted"
  - "Store-empty proof after every rejection, checked inside the behaviour rules"

requirements-completed: [TEL-10, TEL-11]  # server halves complete; the owner deploy and rate-limit rule (48-05) and the sweep (48-03) finish the requirements

# Metrics
duration: not recorded
completed: 2026-10-31
status: complete
---

# Phase 48 Plan 02: Telemetry Worker for error events, download counts and 30-day retention Summary

**The events Worker validates and stores opt-in error reports, takes authenticated download counts, deletes rows after 30 days, and its contract gate turns red on each of 21 planted faults.**

## Performance

- **Duration:** not recorded (no timer was started at plan start)
- **Started:** not recorded
- **Completed:** 2026-10-31
- **Tasks:** 2 of 2
- **Files modified:** 6

## Accomplishments

- POST /events accepts only the POST method on exactly /events. A body over 65536 bytes answers 413 oversized_body, a batch over 100 events or a non-array events field answers 400 malformed_batch, an unparseable or non-object body answers 400 malformed_body, and a non-JSON content type answers 400.
- Each accepted event is reduced to the admitted set. Strings are cut to 256 characters, line and column are kept only when finite, and nothing else from the client reaches the row. Every row gets server time from received_at, and no client-supplied identifier is stored.
- POST /download-counts checks Authorization Bearer against env.DOWNLOAD_COUNT_SECRET in constant time, answers 401 with an empty body when the header is missing or wrong, validates asset, tag and download_count, and upserts one row per asset and UTC day.
- A daily scheduled export deletes rows older than 30 days from both tables. The maintainer query excludes synthetic probe rows.
- The gate derives the Worker's exports and checks the producer's ADMITTED_KEYS, the privacy page's "kept for 30 days", the schema columns, the wrangler descriptor, and the absence of assigned credentials in worker/. Each behaviour rule runs against a stub D1 and requires an empty store after every rejection.
- The self-test runs the unmutated control first and then 21 planted faults, each a one-line mutation of a copy of the Worker or of a document. Every plant goes red naming its rule.

## Task Commits

1. **Task 1: Worker, D1 schema and deploy descriptor** - `6271eb2` (feat)
2. **Task 2: contract gate, registry rows and secret rows** - `3bb3646` (test)

Plan base (HEAD before the first task commit): `a2c4f6e`.
Plan metadata commit: the docs commit that adds this file (the commit after `3bb3646`).

## Files Created/Modified

- `worker/events-worker.mjs` - the Worker: pure handlers handleEvents, handleDownloadCounts, listMaintainerEvents, runRetention, plus the scheduled export and the fetch wrapper
- `worker/schema.sql` - events and download_counts DDL with the upsert comment
- `worker/wrangler.toml` - name, main, compatibility date, the D1 binding with the database placeholder, the daily cron, and the owner runbook in comments; no routes key and no secret
- `scripts/verify-events-worker.mjs` - the contract gate and its self-test (21 plants plus the privacy drift)
- `scripts/verify-platform.sh` - rows events-worker and events-worker-self-test after the crash-collector pair
- `docs/RENEWALS.md` - two rows: the Worker secret and the bot environment copy (appended to the existing table)

## Decisions Made

See key-decisions in the frontmatter. The synthetic control flag is the one that needs the owner's confirmation.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing critical functionality] synthetic marker versus the drop rule**
- **Found during:** Task 1
- **Issue:** the plan says every property outside the admitted set is dropped, and also that synthetic true rows are stored with synthetic 1 and excluded from the maintainer query. Dropping the flag would leave the sweep's probe rows indistinguishable from real reports.
- **Fix:** the Worker reads synthetic as a boolean control flag, stores 0 or 1, and never stores it as text. The gate's extra-property rule checks the admitted row, and the maintainer query excludes the flag.
- **Files modified:** worker/events-worker.mjs, scripts/verify-events-worker.mjs
- **Verification:** the control stores two maintainer rows and one synthetic row; the synthetic plant (query without the filter) goes red
- **Committed in:** 6271eb2

**2. [Rule 1 - Bug in plan text] self-test plants are mutations, not inputs alone**
- **Found during:** Task 2
- **Issue:** the plan asks each plant to go red naming its rule. Several rules are drop or truncate rules (extra property, over-length string, duplicate upsert), which a correct Worker satisfies, so an input alone cannot go red.
- **Fix:** each plant is a one-line mutation of a copy of the Worker (or a copy of a document) that removes or weakens one guard; the same rule checks must then fail naming the rule. The store-empty proof stays inside each rejection rule.
- **Files modified:** scripts/verify-events-worker.mjs
- **Verification:** all 21 plants red, each naming its rule; control green
- **Committed in:** 3bb3646

**Total deviations:** 2 (both in how the plan's rules are expressed in code; no scope added).
**Impact on plan:** the Worker's contract is the plan's. The gate proves it by inputs and by mutation.

## Issues Encountered

- **Not proven on D1.** The stub models the three statement shapes the Worker issues (insert, upsert, select and delete). The schema and the upsert have not run on D1. The owner's first `d1 execute --file worker/schema.sql` at the 48-05 checkpoint is the first real check.
- **Body read before the size check.** The fetch wrapper reads the request body whole before the 64 KiB check. The shortcut is recorded in the Worker; upgrade to a streamed read if abuse shows up.
- **Throttle is per instance.** The 60-per-minute window lives in one Worker instance. The owner's rate-limit rule is the budget that holds across instances.
- **Credential scan scope.** The scan covers assigned secret, token, API-key and password values in worker/. It does not scan for client identifiers; the Worker never reads one, and the gate's extra-property rule covers the admitted row.
- **Sweep-side scan not run here.** The TEL-11 check that the sweep holds no Cloudflare token belongs to plan 48-03; no sweep file exists yet, so nothing was scanned.
- **RENEWALS overlap.** The existing row "Telemetry route shared secret, bot environment and Worker" (2026-10-29) already covers both secrets. The two new rows are the rows the plan asked for; the owner may merge them.

## Flagged Assumption Outcomes (TEL-10 and TEL-11 groups)

- **TEL-10 boundary:** only /events and /download-counts answer a POST; every other method or path answers 404 with an empty body (wrong method and wrong path plants). No other listener exists in the Worker.
- **TEL-10 precision:** enforced values are MAX_BODY_BYTES 65536 (UTF-8 bytes, measured before parse), MAX_EVENTS 100, MAX_STRING_CHARS 256 (UTF-16 code units). Over-cap body, over-cap batch and over-length string plants prove the numbers.
- **TEL-11 adjacency:** the Worker side holds no token: the credential scan finds none in worker/. The sweep-side scan is plan 48-03's.
- **TEL-11 empty:** the no-data state of the download-count row is plan 48-03's; not exercised here.
- **TEL-11 ordering:** a second POST for the same asset and day leaves one row with the latest count (duplicate asset-day plant proves the upsert).
- **TEL-11 concurrency:** the compare is constant-time and the secret is never logged or stored. The wrong-secret plant covers the 401 path. A concurrent double POST was not driven.
- **A48-2 hostname:** the Worker holds no hostname literal. The runbook's synthetic POST uses events.powerbrowser.org, the assumed name from plan 48-01.
- **RESEARCH Q5 (resolved here):** events keeps one row per admitted event with server received_at; download_counts upserts per (asset, day); the 30-day delete covers both tables.

## Privacy Handoff (for the Phase 47 page, already consistent)

Payload: type, basename, line, column, version, buildID, OS (the wire keys are type, source, line, column, version, buildID, os). Retention: 30 days. Processor: Cloudflare. Hosts: the events hostname only. Privacy contact and postal address: Phase 47. The page and the Worker agree on the retention number; the gate checks it.

## Verification Evidence

- `node --input-type=module` import of worker/events-worker.mjs prints the contract literals with no side effects
- `node scripts/scan-brand-residue.mjs`: PASS after staging
- `scripts/verify-platform.sh --only events-worker`, `--only events-worker-self-test`: PASS
- `scripts/verify-platform.sh --only renewals`, `--only renewals-self-test`, `--only workflows`: PASS
- `node scripts/verify-events-worker.mjs --self-test`: control green, 21 planted faults each red naming its rule
- `scripts/verify-platform.sh --quick`: run after this file was written (result in the completion report)

## Self-Check

- [x] Created files exist: worker/events-worker.mjs, worker/schema.sql, worker/wrangler.toml, scripts/verify-events-worker.mjs
- [x] Commit 6271eb2 is an ancestor of HEAD
- [x] Commit 3bb3646 is an ancestor of HEAD

## Self-Check: PASSED

## Next Phase Readiness

- Plan 48-03 (maintenance sweep) calls POST /download-counts with the bot environment copy of the secret and reads the row's no-data state until Phases 49 and 50.
- Plan 48-05 (owner checkpoint) runs the commands in worker/wrangler.toml: pinned wrangler version, d1 create, d1 execute of schema.sql, secret put, deploy, the rate-limit rule (threshold recorded verbatim), and one synthetic POST.
- Owner decisions to check: the synthetic control flag (Rule 2 above), and whether the two new RENEWALS rows should merge with the existing combined row.

## Code Review Fixes (Phase 48 review, plans 48-01 and 48-02)

The review fixes are in `48-REVIEW-FIX.md`. They change this summary's earlier statements as follows:

- **Superseded: throttle.** The per-instance 60-per-minute window is gone. The Worker keeps no counter; the one per-IP zone rule (now stated over both `/events` and `/download-counts`, with `workers_dev` and `preview_urls` off) is the rate limit. The `throttled_in_worker_cap` reason no longer exists.
- **Superseded: body read.** The body cap is enforced from Content-Length before the read and while the body streams in; an unauthenticated download-count POST reads no body.
- **Resolved: the synthetic flag.** The flag is honoured only when the request proves the shared secret; an anonymous flagged event is stored as a real one. The step 7 probe in `worker/wrangler.toml` sends the secret and uses the real envelope.
- **Changed: wire contract.** Events are read from the sender's `{kind, name, data, at}` envelope; `name` is a stored column; `kind` `usage` is skipped, any other non-`error` kind or a shape mismatch answers 400 `malformed_event`; an empty events array answers 400 `malformed_batch`; a wrong method on a known path answers 405.
- **Changed: `compatibility_date`** is the fixed past date 2025-01-01, not the day of writing.

### Open owner decisions

- **IN-03 (open, not changed): the usage path at level `all` is unfiltered.** `sendEventData(name, data)` still sends any event name and any data object to the endpoint when the level is `all`. The Worker now skips `usage` events, so nothing from that path is stored, but the data has already left the machine. The preference text discloses extension telemetry at "on" and does not say that `all` sends arbitrary payloads. Options: apply the admitted-key and shape filter to the usage path, or have `all` send nothing beyond the error path until a usage schema exists, and name the difference in the preference text. Owner to decide.
- **IN-04 (open, not changed): Gecko `toolkit.telemetry.server` is repointed at the events Worker whenever the level is not `off`.** The unified-telemetry flags are compiled out, so this should be inert, but if any Gecko telemetry path is ever enabled it would POST non-error pings to the error endpoint. `verify-telemetry` check 5 asserts only the blank at level off. Options: add a check that the compile-out holds, or keep the Gecko pref blank for the Worker host. Owner to decide; worth a note in the privacy review.
- **Residual from CR-03.** The generator now refuses a downstream that enables a level on the platform endpoint. A downstream at level `off` that omits `[telemetry] endpoint` still inherits the platform endpoint in its fragment, so a user who raises the preference in that build would send to the platform host. The review and the fix scope stop at "level is not off"; closing it means making every downstream state its own endpoint. Owner to decide.
- **CORS origin.** The Theia page's origin is `http://127.0.0.1:<port>` with a per-launch port, so `Access-Control-Allow-Origin` echoes the request origin only when it matches that pattern. The dev app on `localhost:3000` is not allowed and cannot deliver reports. Not verified in a live browser; the 48-05 loopback live-delivery row is the first real check.
- **D1 query limit.** The sender sends at most 20 events per POST. A hostile batch of up to 100 events becomes one `DB.batch` of up to 100 statements; the review cited a 50-query per-invocation limit on the free plan, which I did not re-verify. Not changed.

