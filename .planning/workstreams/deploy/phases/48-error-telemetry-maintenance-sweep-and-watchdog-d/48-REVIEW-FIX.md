---
phase: 48-error-telemetry-maintenance-sweep-and-watchdog-d
fixed_at: 2026-10-31T00:00:00Z
review_path: .planning/workstreams/deploy/phases/48-error-telemetry-maintenance-sweep-and-watchdog-d/48-REVIEW.md
iteration: 1
findings_in_scope: 12
fixed: 12
skipped: 0
status: all_fixed
---

# Phase 48: Code Review Fix Report

**Branch:** dsh/phase-48. **Source review:** 48-REVIEW.md. **Verification ran in:** the main checkout of the clone (no worktree was created; the caller directed the work into the clone itself).

IN-03 and IN-04 were left unchanged by instruction and are recorded as open owner decisions in 48-02-SUMMARY.md.

## One line per finding

- CR-01: FIXED 3733e9c (Worker reads the {kind, name, data, at} envelope, stores name, skips usage, rejects a malformed error event; the gate drives the real reporter and sender into handleEvents and requires a fully populated row; plants: flat Worker, flat sender, renamed-nesting sender, removed kind check)
- CR-02: FIXED 2bd317c (OPTIONS /events answers 204 with allow-origin for the loopback sidecar origin only, allow-methods POST, allow-headers content-type; allow-origin on every /events response and never on /download-counts; the allowed origin is derived by the gate from the shell's --hostname; plants: no preflight, CORS on download, no CORS, widened origin)
- CR-03: FIXED 6ecc1dd (resolveConfig refuses a downstream with a non-off level whose endpoint host is the platform's, unless the identity is the platform's own; the omission self-test case is restored next to the cleared-endpoint case; generate --check and --self-test green)
- CR-04: FIXED 34fc6ff (shapes for type, source, version, buildID, os, line and column in telemetry-enrichment.ts; the sender drops the whole report on a mismatch; the Worker restates the shapes and rejects the batch; the gate compares both sets; plants: path in each admitted key, key-only drop, removed shape check on both sides)
- WR-01: FIXED 444d585 (workers_dev = false and preview_urls = false; runbook step 6 is one zone rule over /events and /download-counts, the only guess limit for the secret; gate pins both literals and the runbook coverage)
- WR-02: FIXED 21ca274 (in-Worker throttle removed; the zone rule is the rate limit; the gate floods 150 POSTs through the real fetch handler and requires a second caller to be stored; plant restores a shared counter)
- WR-03: FIXED 05323d2 (one env.DB.batch; the gate stub models the transaction, fails the second insert and requires an empty store; plant restores the sequential loop)
- WR-04: FIXED b88db4c (synthetic honoured only with the shared secret; os, line, column and kind validation landed with CR-01 and CR-04; the runbook probe uses the real envelope and the secret)
- WR-05: FIXED ca21f1d (plants for the unset secret, the empty secret and the missing scheme check, plus cases for an empty Bearer token and a Digest header; the contract, CORS and content plants landed with CR-01, CR-02 and CR-04)
- WR-06: FIXED d7c9201 (Content-Length checked before the read, a streamed read that stops at the cap, and the secret checked before the download-counts body is read; the gate counts pulls on a tracked stream; three plants)
- IN-01: FIXED fd4f305 (IF NOT EXISTS on every CREATE; the gate requires it and plants a bare CREATE INDEX)
- IN-02: FIXED b41120f (truncation on code points with toWellFormed, empty batch rejected, 405 with Allow for a wrong method, compatibility_date = 2025-01-01, download counts must be safe integers)
- IN-03: NOT FIXED by instruction (left unchanged); recorded as an open owner decision in 48-02-SUMMARY.md
- IN-04: NOT FIXED by instruction (left unchanged); recorded as an open owner decision in 48-02-SUMMARY.md

## Verification

- `node scripts/verify-telemetry.mjs` and `--self-test`: PASS (8 planted faults and the error-report case).
- `node scripts/verify-events-worker.mjs` and `--self-test`: PASS (control green, 46 planted faults each red naming their rule).
- `node scripts/generate.mjs --check` (56 files byte-identical) and `--self-test` (68 planted faults): PASS.
- `scripts/verify-platform.sh --only` for telemetry, telemetry-self-test, events-worker, events-worker-self-test, theia-endpoints, theia-endpoints-self-test, allowlist-schema, generate-check and generate-self-test: all PASS.
- `tsc -b extensions/telemetry --force` under `nix develop .#theia`: exit 0.
- Reproductions of CR-01, CR-03 and CR-04 against the fixed tree: CR-01 now stores `[received_at, name, type, basename, line, column, version, buildid, os, synthetic]` fully populated and the old flat shape answers 400 malformed_event; CR-03 reports one failure naming telemetry.endpoint for the Acme level-error manifest; CR-04 sends nothing for a path in type, source, os or an oversized version, and the Worker answers 400 malformed_event with no row stored for the same input.
- `scripts/verify-platform.sh --quick`: exit 0, "verify-platform: PASS -- all checks passed".

## Not verified

- No live browser run: the CORS fix follows from the Fetch spec and the gate's Request-level drive. The 48-05 loopback live-delivery row is the first real check.
- Nothing ran on D1 or wrangler; the stub models the batch transaction.
- `workers_dev`, `preview_urls` and the no-route deploy behaviour were not checked against the owner's pinned wrangler.

---

_Fixed: 2026-10-31_
_Fixer: Claude (gsd-code-fixer)_
_Iteration: 1_
