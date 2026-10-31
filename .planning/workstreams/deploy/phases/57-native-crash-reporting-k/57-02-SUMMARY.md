---
phase: 57-native-crash-reporting-k
plan: 02
subsystem: telemetry-crash-reporting
tags: [tel-07, crash-submit, r2, worker, origin-derivation, collector-contract]
status: complete
requirements: [TEL-07]
commits: 3
plan_head_before: c755d408
plan_head_after: a78730cb
---

# Phase 57 Plan 02: crash submit origin, collector plants, R2 receiver (TEL-07)

**One line:** one `[urls].crash_report` key drives the submit origin and the view-link base, the collector gate proves the Gecko-shaped `extra` contract, and a `worker/` receiver writes minidumps to R2 under a 30-day lifecycle, all inert until the owner deploys and TEL-13 flips the reporter on.

## Commits

| Task | Commit | Subject |
|---|---|---|
| 1 | 095671a8 | feat(57-02): derive the crash submit origin from [urls].crash_report |
| 2 | 773721eb | test(57-02): Gecko-shaped extra plants in the collector contract gate |
| 3 | a78730cb | feat(57-02): crash-submit receiver with R2 retention and contract gate |

## Task 1: origin derivation (inert while unset)

- `scripts/generate.mjs`: `crashReporterOrigin(config)` returns `''` for an unset key and the origin of a stated https
  URL otherwise (the path is dropped; the view-link base keeps it verbatim through `mozillaEndpointPrefs`).
  `emitMozconfigFor` adds `ac_add_options --with-crashreporter-url=<origin>` only when the origin is non-empty.
- `--disable-crashreporter` is still emitted unchanged. When the owner states a key, the `.mozconfig` carries both
  lines; the TEL-13 flip removes the disable line.
- Derivation proof: the generator self-test gained a control on a fixture manifest. A stated
  `https://crash.example.org/report` derives `https://crash.example.org` and emits the line; the unset fixture emits
  no line. Output: `generate: --self-test PASS -- 69 planted faults all behaved as pinned`.
- `node scripts/generate.mjs --check`: PASS, 68 files. `git diff HEAD -- .mozconfig`: empty.
- `scripts/verify-theia-endpoints.mjs --self-test`: PASS, 4 planted faults. Two are new:
  - an unattended crash host with no allowlist row goes red naming `crash.example.org`;
  - a stated `crash_report` whose `breakpad.reportURL` expect is still blank goes red naming `breakpad.reportURL`.
  The existing stale-marked plant still fires for `urls.crash_report`.

**Deviation (plan Task 1 step 3, not landed):** the crash-host allowlist row with `manifest: "urls.crash_report"` was
NOT added to `powerbrowser/endpoint-allowlist.json`. With the key unset, `verify-theia-endpoints.mjs` step 3 treats any
marked row as stale and goes red. The row therefore lands with the owner's key statement (BLOCKED.md B3). The
`breakpad.reportURL` expect stays `""`, which is what the manifest derives while the key is unset.

## Task 2: collector Gecko-shaped plants

- `scripts/verify-crash-collector.mjs` derives the `extra` filename and MIME from
  `upstream/toolkit/crashreporter/client/app/src/net/report.rs` at check time (`geckoExtraShape()`, the same declaration
  `verify-ng-068-crash-extra-part.mjs` reads).
- Plant 9: a Gecko-shaped extra stores exactly the allowlisted scalars. The non-allowlisted key, the oversized
  allowlisted value and the non-scalar allowlisted value are each dropped.
- Plant 10: a malformed extra keeps the report, stores no annotation from the part, and keeps the minidump bytes.
- Mutation check (in a scratch copy, not committed): skipping the allowlist check goes red on the control and on
  Plant 9, naming the stored `NotAllowlisted` key.
- Output: `verify-crash-collector.mjs --self-test` PASS; the main gate PASS.
- `verify-ng-068-crash-extra-part.mjs` is untouched. `grep -c 'verify-ng-'` on the collector gate: 0.

## Task 3: crash-submit receiver

Files: `worker/crash-submit.mjs`, `worker/wrangler-crash.toml`, `worker/crash-r2-lifecycle.json`,
`scripts/verify-worker-submit.mjs`, two rows in `scripts/verify-platform.sh`, and operator rows in `docs/RELEASING.md`.

The receiver speaks the collector's contract: the part name `upload_file_minidump`, the `CrashID=<uuid>` and
`Discarded=<rule>` bodies, the 16 / 8 MiB / 20 MiB caps, the 7-field allowlist with the 4096-byte scalar cap, and
malformed-extra-keeps-report. Its multipart parser is binary-safe. `Response.formData()` was rejected because Gecko's
minidump part carries no filename and formData would decode it as text.

Phase 48 delta, measured against `worker/events-worker.mjs` and its review fixes:

- **Workers-dev off.** `workers_dev = false`, `preview_urls = false`; the zone rule is the only rate limit (WR-01).
- **No in-Worker throttle.** The collector's 60/60 s counter is NOT copied. A per-isolate counter is not a rate limit,
  and a shared one lets one client discard every other client's report (WR-02). The receiver never answers
  `throttled_per_minute_cap`. The gate fails any source that names it. The policy states this delta.
- **One batch-equivalent write.** R2 has no batch call. The dump is written first, the record last, and a failed
  record write removes the dump (the analogue of IN-02/WR-03's single transaction). The gate's store stub fails the
  record write and requires an empty store.
- **405 for a wrong method** on the known path (IN-02). The collector answers 404; the gate pins the receiver's 405.
- **No CORS.** The sender is native. No preflight or Access-Control header is sent, and the gate fails one that is.
- **Credential scan.** The gate scans every file in `worker/` for a credential-shaped assignment (same rule as the
  events gate). The receiver reads no secret.
- **Concurrency.** Two concurrent submits keep distinct ids and four objects. Object names are server-assigned UUIDs,
  so concurrent writes never share a key (the edge backstop).
- **Retry.** A retried submit is a new record (the flagged idempotency assumption). No deduplication is added.

Deviations recorded:

- The R2 config lives in a new `worker/wrangler-crash.toml`, not in `worker/wrangler.toml`. The events Worker must not
  gain a binding it does not use. The plan's grep for lifecycle text in `wrangler.toml` therefore targets the new file.
- The 30-day rule is recorded as `worker/crash-r2-lifecycle.json`, which is recorded configuration, not the Cloudflare
  schema. The owner applies it, and the runbook says to check the flag names against the pinned wrangler first.

Gate outputs:

- `scripts/verify-worker-submit.mjs`: PASS.
- `scripts/verify-worker-submit.mjs --self-test`: PASS. Control green, then the planted faults go red naming the rule:
  missing minidump, malformed content type, oversized body, non-allowlisted key dropped, malformed extra kept, store
  fault leaves nothing, `workers_dev` enabled, lifecycle age drifted, second job scheduled, in-process throttle named,
  credential assigned in `worker/`.
- The events gate `verify-events-worker.mjs` remains green (rc 0) with the new files in `worker/`.
- Parser agreement: the collector and the receiver agree on every battery body (well-formed with boundary-text bytes,
  wrong type, no minidump, zero parts, too many parts, oversized part, malformed extra).
- Residue scan: PASS over 490 files after `git add -N` of the new files.

## Owner checkpoint (human action, NOTHING deployed in-session)

The exact commands and the three probe responses are in BLOCKED.md B3 and the `worker/wrangler-crash.toml` runbook.
In short: enable R2; create bucket `powerbrowser-crash-reports`; apply the 30-day rule over `crash/`;
`wrangler deploy --config worker/wrangler-crash.toml`; add the zone rate-limit rule over `/submit`; record the
threshold and period; post the well-formed, oversized and burst probes and paste the responses verbatim. No secret was
created or stored in the tree.

## Verification (--quick)

`scripts/verify-platform.sh --quick` exit 0 after each of the three commits. The output's `: FAIL` lines are the
self-test diagnostic lines of the group-channel plants, as in the baseline run, not failures.
