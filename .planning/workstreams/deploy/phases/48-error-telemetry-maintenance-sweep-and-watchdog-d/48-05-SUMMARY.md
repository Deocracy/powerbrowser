---
phase: 48-error-telemetry-maintenance-sweep-and-watchdog-d
plan: 05
subsystem: telemetry
tags: [tel-06, tel-10, tel-11, train-07, mon-01, owner-checkpoint, operator-record, pre-checkpoint]
status: partial
requires:
  - phase: 48-01..48-04
    provides: producer and manifest, events Worker, maintenance sweep, loopback drill and watchdog source
provides:
  - Pre-checkpoint proof (Task 1) and the owner command pack (Task 2 input)
affects: [48-05 Tasks 2 and 3 (owner deploys and drills, then operator record), Phase 49, Phase 50 criterion 5]
actuals:
  tokens: 4900
  tasks: 1
  commits: 1
plan_head_before: a5f93b418e0632bbdb044f9341588594232facf6
plan_head_after: the commit that adds this file (its own hash cannot be written inside it)
requirements-completed: []  # none: TEL-06, TEL-10, TEL-11, TRAIN-07, MON-01 are live only after Tasks 2 and 3
completed: pre-checkpoint 2026-11-01 UTC
---

# Phase 48 Plan 05: Live checkpoint Summary (pre-checkpoint state)

**Task 1 is complete: the built halves are green and the owner command pack is below. Tasks 2 and 3 are NOT executed. Nothing live ran, so no live row is claimed.**

## Status

| Task | Name | State |
| ---- | ---- | ----- |
| 1 | Pre-checkpoint proof and command pack | Executed (this file) |
| 2 | Owner deploys the Worker, proves the route, pins the issue, applies the watchdog, runs both drills | NOT executed (blocking-human checkpoint) |
| 3 | Record the operator evidence and close the phase validation | NOT executed (needs the owner's reply) |

**Pre-checkpoint dated 2026-11-01 UTC.** No wrangler command, dashboard change, DNS change, `gh api` write, pin, watchdog apply or scheduler disable was run. Read-only calls only.

## Task 1 evidence

Run in the git worktree `/home/chris/gsd-workspaces/deploy-w2-48-05/Power-Browser` (branch `deploy/w2-48-05`, base `a5f93b41`). `upstream/` and `theia/node_modules` are symlinks into the main deploy worktree.

### `scripts/verify-platform.sh --quick` from this worktree

Exit non-zero. Exactly six rows are red, all worktree-environment reds, none touched by Phase 48:

| Red row | Reason seen in this worktree |
| ------- | ---------------------------- |
| single-copy-deps | `theia/node_modules` reported absent (the symlink does not satisfy it) |
| ng086-theia-react-node | `theia/node_modules is absent`; empty `@theia/*` walk |
| gui07-strip-spike-verdict | unmodified tree already red |
| gui07-strip-spike-verdict-self-test | unmodified tree already red, so plants are meaningless |
| gui09-dependent-window-content | dependent-window surface drift report |
| gui09-dependent-window-content-self-test | unmodified tree already red |

Every other row printed PASS (612 PASS lines in the log). The `red -- group-channel: FAIL` lines in the log are the group-channel self-test's own planted faults going red as intended, not failures; `group-channel` and `group-channel-self-test` are PASS.

One oddity recorded rather than explained: the `single-copy-deps` message names `/home/chris/gsd-workspaces/deploy-w2-58-03/Power-Browser/theia/node_modules`, a path outside this worktree. I did not investigate it; the row is in the known-red list either way.

**The authoritative green `--quick` is the run on the merged head in the main deploy worktree. I did not see that run and do not claim it here.** The plan's "--quick green" evidence line is therefore NOT satisfied by this file; Task 3's final `--quick` must be run there.

### Gates run alone with `--only` (all from this worktree)

All PASS: telemetry, telemetry-self-test, theia-endpoints, theia-endpoints-self-test, allowlist-schema, events-worker, events-worker-self-test, release-train-maintenance-self-test, tel06-error-delivery-live-self-test, watchdog, watchdog-self-test, workflows, workflows-self-test, zizmor.

Direct runs (plan's automated verify, minus the aggregate `--quick`):

- `node scripts/verify-events-worker.mjs`: exit 0 (a Node module-type warning for the telemetry extension is printed; it is a warning, not a failure).
- `node scripts/verify-telemetry-live-delivery.mjs --self-test`: `tel06-error-delivery-live: --self-test PASS -- 26 analyzer plants and 2 drill-safety plants went red naming their drift, with the controls green first`.
- `node scripts/verify-watchdog.mjs`: `watchdog: PASS -- the workflow's own shell, run under a stub gh, opens nothing at 25 hours, one issue with the run link at 27 hours, one naming the missing run, and none when its own issue is open ...`.
- `node scripts/scan-brand-residue.mjs`: `scan-brand-residue: PASS -- no residual brand occurrence in 553 scanned file(s)`, exit 0.

### Git status of owned paths

`git status --short -- scripts/ worker/ theia/ powerbrowser/ configuration.toml .github/ docs/watchdog.yml` prints exactly one line: `?? theia/node_modules`. That is the worktree symlink, not build-plan work. No tracked file is modified. The plan's literal `test -z "$(git status --short -- ...)"` therefore fails in this worktree for that reason alone and passes in a worktree with a real `theia/node_modules` or an ignore entry; the same applies to untracked `upstream`.

## Facts the command pack depends on (read from the tree)

- **Organisation and repositories:** `Deocracy/powerbrowser` (product; the `deocracy` remote and `configuration.toml` `release_notes` agree) and `Deocracy/powerbrowser-updates`. The older organisation name in the plan body and in `worker/wrangler.toml` comments is superseded (BLOCKED.md, settled 2026-10-31). `docs/watchdog.yml` derives the owner from `github.repository_owner`, so applying it to `Deocracy/powerbrowser-updates` reads `Deocracy/powerbrowser` with no edit.
- **Hostname (A48-2):** `events.powerbrowser.org`. No Phase 47 summary names an events host, so the assumed name stands. The Worker has no route and `workers_dev` and `preview_urls` are off, so it is unreachable until the hostname is attached to the Worker (see step A0).
- **Frozen contract literals:** POST `/events` and `/download-counts` only; body cap 65536 bytes answers 413 `oversized_body`; 100 events per batch; 256 characters per string; empty or non-array `events` answers 400 `malformed_batch`; 200 body `ok: stored <n>` or `ok: stored <n> synthetic <m>`; synthetic flag honoured only with `Authorization: Bearer $DOWNLOAD_COUNT_SECRET`; retention 30 days by the daily 03:00 UTC cron; `compatibility_date = "2025-01-01"`.
- **Sweep row order:** runner-online, esr-pin-age, channel-liveness, watchdog-age, synthetic events POST, download-count. Deferred no-data rows: runner-online, channel-liveness, download-count.
- **Watchdog:** cron `17 6 * * *` plus `workflow_dispatch`; threshold 93600 s (26 h); issue title `release-train has not run in 26 h`, label `release-train-watchdog`; reads `repos/Deocracy/powerbrowser/actions/workflows/release-train.yml/runs`.
- **Drill:** `tel06-error-delivery-live` is the full-tier registry row, backed by `scripts/verify-telemetry-live-delivery.mjs`.
- **Plan staleness corrected in the pack:** the plan names the worktree `/home/chris/gsd-workspaces/deploy/dsh/phase-48`; the pack uses the main deploy worktree `/home/chris/gsd-workspaces/deploy/Power-Browser` (merged head). The plan lists the D1 `execute` command without `--remote`; the pack uses `--remote` as `worker/wrangler.toml` and `worker/schema.sql` state, because without it wrangler applies the schema to a local database.

## Owner command pack (Task 2)

Every step is the owner's. Never paste a secret value, token, recovery code or private key back. Paste only the lines each step names. Replace `<slug>` with `Deocracy`. All `nix run nixpkgs#wrangler` commands run outside any flake dev shell.

### Order

Do D (watchdog apply) **before** B (pin). Plan 48-03 recorded that pinning first makes the watchdog-age row red on the first sweep and costs one comment. Before pinning also: set the repository variable `OWNER_LOGIN` on `Deocracy/powerbrowser` to the owner login, grant the bot App Actions (read) on `Deocracy/powerbrowser-updates`, and make sure the release train is on the default branch of `Deocracy/powerbrowser` (BLOCKED.md items 1, 2, 4). Without the train on `main` there is no run to read.

### A. Cloudflare deploy (TEL-10, TEL-11)

```sh
cd /home/chris/gsd-workspaces/deploy/Power-Browser/worker
```

- **A0. Hostname precondition (read first).** Confirm `events.powerbrowser.org` exists in the `powerbrowser.org` zone and is attached to the Worker `powerbrowser-events` after step A5 (dashboard: Workers & Pages, powerbrowser-events, Settings, Domains & Routes, custom domain). Phase 47 does not record this attachment. If the hostname differs, use that name for A7, B and the SUMMARY.
- **A1.** `nix run nixpkgs#wrangler -- --version`. Paste the version line.
- **A2.** `nix run nixpkgs#wrangler -- d1 create powerbrowser-events`. Paste the database id (the one value allowed in the operator record).
- **A3.** Apply the schema with the real id kept out of the tree. Copy the config to an untracked file, substitute the id there, use it for every wrangler call that reads it, then delete it:
  ```sh
  cp wrangler.toml wrangler.deploy.toml
  sed -i "s/REPLACE-WITH-OWNER-D1-ID/<the id from A2>/" wrangler.deploy.toml
  nix run nixpkgs#wrangler -- d1 execute powerbrowser-events --remote --config wrangler.deploy.toml --file schema.sql
  ```
  Paste the last lines of the output.
- **A4.** `nix run nixpkgs#wrangler -- secret put DOWNLOAD_COUNT_SECRET --config wrangler.deploy.toml`. Type the shared secret at the prompt. Paste only the success line.
- **A5.** `nix run nixpkgs#wrangler -- deploy --config wrangler.deploy.toml`. Paste the deployed URL line and the version id. Then `rm wrangler.deploy.toml` and confirm `git -C /home/chris/gsd-workspaces/deploy/Power-Browser status --short worker/` is empty.
- **A6.** Dashboard, zone `powerbrowser.org`, Security, WAF, Rate limiting rules: create ONE rule. Expression: hostname equals `events.powerbrowser.org` and URI path in `/events` `/download-counts`. Counting by IP. Action block. Threshold 60 requests per one-minute period per IP (owner ruling 2026-11-03; retune from Worker analytics after the first release). Paste threshold plus period verbatim as the dashboard shows them.
- **A7. Probes**, from a machine outside the Cloudflare account, in this order (the burst last, so it cannot block the first two):
  1. Synthetic POST, expecting HTTP 200 and body `ok: stored 1 synthetic 1`:
     ```sh
     read -rs DOWNLOAD_COUNT_SECRET
     curl -sS -i -X POST https://events.powerbrowser.org/events -H 'content-type: application/json' -H "authorization: Bearer $DOWNLOAD_COUNT_SECRET" --data '{"events":[{"kind":"error","name":"synthetic.probe","data":{"type":"SyntheticProbe"},"synthetic":true,"at":0}]}'
     ```
     Paste the status line and the body only (not the request). This is the runbook's exact form in `worker/wrangler.toml`. The plan text asks for two admitted events plus one synthetic; that variant would leave real-looking rows in the maintainer view until 30-day retention, so the pack uses the one-synthetic form (owner ruling 2026-11-03: one synthetic event).
  2. D1 row count, expecting exactly one synthetic row on a fresh database:
     ```sh
     nix run nixpkgs#wrangler -- d1 execute powerbrowser-events --remote --command 'SELECT synthetic, COUNT(*) AS n FROM events GROUP BY synthetic'
     ```
     Paste the result table. Expected: one row, `synthetic = 1`, `n = 1`.
  3. Over-cap body, expecting HTTP 413 and body `oversized_body`:
     ```sh
     head -c 70000 /dev/zero | tr '\0' a > "$TMPDIR/big.json"
     curl -sS -i -X POST https://events.powerbrowser.org/events -H 'content-type: application/json' --data-binary @"$TMPDIR/big.json"
     ```
     Paste the status line and body.
  4. Burst past the rule, expecting responses to change from 400 `malformed_batch` to the rule's block response (Cloudflare's default block is HTTP 429). A body of `{}` is used so no D1 row is written:
     ```sh
     for i in $(seq 1 300); do curl -s -o /dev/null -w '%{http_code}\n' -X POST https://events.powerbrowser.org/events -H 'content-type: application/json' --data '{}'; done | sort | uniq -c
     ```
     Paste the output. Your IP stays blocked for the rule's period.

### D. Watchdog (MON-01), before B

- **D12.** Apply `/home/chris/gsd-workspaces/deploy/Power-Browser/docs/watchdog.yml` byte for byte as `.github/workflows/watchdog.yml` in `Deocracy/powerbrowser-updates` (new file only; the repository is empty, so a first commit comes with it). Confirm no `functions/` directory and no `_worker.js` is added. Commit and push there. Paste the commit SHA and the file listing (`git ls-files`) of that commit.
- **D13.** Record the baseline for the 60-day probe: `gh api repos/Deocracy/powerbrowser-updates/commits?per_page=1 --jq '.[0].commit.committer.date'` and `gh api 'repos/Deocracy/powerbrowser/actions/workflows/release-train.yml/runs?per_page=1' --jq '.workflow_runs[0].run_started_at'`. Paste both dates.
- **D14 (the 26-hour drill).** The watchdog repository `Deocracy/powerbrowser-updates` must hold `vars.WATCHDOG_AUTHOR` only if `gh` reports a bot author other than `app/github-actions`. Disable the scheduler cron that wakes the train (disable dispatches; do not delete the Worker) and note the UTC time. After 26 hours with no train run, wait for the next 06:17 UTC watchdog tick. Expect one issue titled `release-train has not run in 26 h`, label `release-train-watchdog`, body with the run link plus both timestamps. Paste the issue link, the body's run link and timestamps, then re-enable and paste the disable time and the re-enable date. Dispatch alone does not count: the 26-hour clock needs the real stop.

### B. Pinned maintenance issue (TRAIN-07)

- **B8.** Create the issue with the exact title `release-train: maintenance`, label `release-train`, authored from the owner account, in `Deocracy/powerbrowser`. Pin it. Paste its link and the pin evidence (`gh api repos/Deocracy/powerbrowser/issues/<n> --jq '{number,title,user:.user.login,labels:[.labels[].name]}'` plus a screenshot description or the repository's pinned list). The report job never creates it; with no pinned issue it prints a would-create line and writes nothing.
- **B9.** Dispatch one sweep and approve the `bot` environment prompt (asked at most once a day):
  ```sh
  gh workflow run release-train.yml --repo Deocracy/powerbrowser -f reason=owner
  ```
  Open the run. Paste the body-equals-render evidence line (the run's printed render and the issue body must be byte-equal, and the report job's diff note) and quote the three no-data rows verbatim: `runner-online`, `channel-liveness`, `download-count`. Expect `synthetic events POST` green only after A is done.
- **B10. Red-row plant.** Break exactly one row with the Phase 48 mechanism the BLOCKED record names: set the `bot` environment secret `DOWNLOAD_COUNT_SECRET` to a wrong value, then dispatch again (`reason=owner`). Expect the `synthetic events POST` row red and **exactly one** new comment on the pinned issue. Paste the comment link and the issue's comment count before and after. Dispatch a third time with the plant still in place and paste the zero-new-comments evidence (comment count unchanged). The sweep decides per UTC day (BLOCKED item 1); if a re-dispatch answers that today's sweep was already accepted, run the staying-red step on the next UTC day and record that. Then restore the correct secret, dispatch once more and paste the green render. Never leave the plant red.

### C. Full-tier drill (TEL-06)

- **C11.** On the display-capable host, from `/home/chris/gsd-workspaces/deploy/Power-Browser` in the nix theia environment: `scripts/verify-platform.sh --only tel06-error-delivery-live`. The drill refuses a dirty tracked tree, rebuilds the frontend, posts to a loopback server (never production), and restores `theia/applications/browser/package.json`. Paste the PASS line with the date. Expected content: one POST carrying both events after the preflight, zero requests at level off, `package.json` byte-identical afterwards, zero marker hits in the rebuilt bundle.

### E. Secrets record

- **E15.** State the rotation action and date for the Worker secret and the bot-environment copy for `docs/RENEWALS.md` (rows exist, dated 2026-10-31, rotate on compromise). Confirm `DOWNLOAD_COUNT_SECRET` in the Worker equals the bot-environment value, and that no secret value, token, recovery code or D1 id beyond the operator record was pasted anywhere else.

### Reply format (resume signal)

A: D1 id, wrangler version, schema tail, rule threshold plus period, synthetic 2xx plus row count, 413 and burst responses. B: issue link, render evidence, three no-data rows quoted, one-comment and zero-comment evidence, restored green. C: PASS line plus date. D: watchdog commit SHA, baseline dates, watchdog issue link, re-enable date. E: rotation action plus date and the no-credential confirmation.

## Operator record (to be filled by Task 3; empty on purpose)

| Section | Evidence | State |
| ------- | -------- | ----- |
| Cloudflare deploy (D1 id, wrangler version, schema tail, rule threshold plus period, synthetic POST plus one row, 413, burst) | done live 2026-11-07 (CARRY-FORWARD section 2); D1 id not committed (OWNER-PASS section 3b). Worker on events.powerbrowser.org, D1 `powerbrowser-events`, probes 200 synthetic, 413, 429; one zone rate-limit rule, 10 per 10 s per IP. Wrangler version, schema tail and D1 row count are not in the source | done live |
| Pinned maintenance issue (link, pin, body-equals-render, three no-data rows, one comment, zero comments, restored green) | done live 2026-11-07 (CARRY-FORWARD section 2): maintenance issue #7 pinned. Body-equals-render and the three no-data rows are not in the source; the red-row plant (one comment, zero comments, restored green) is parked | done live (pin); plant open |
| Full-tier drill (`tel06-error-delivery-live` PASS line with date) | none yet | open |
| Watchdog (apply SHA, disable and re-enable dates, watchdog issue with run link plus timestamps) | applied, disabled until the clock ticks | open |
| 60-day probe (last-commit and last-run dates of `Deocracy/powerbrowser-updates` at apply time) | none yet | open |
| Secrets record | none yet | open |

No live row is green. A missing evidence line is an open item, not a pass.

### No-data rows for Phases 49 and 50 (stated now, to be confirmed live in Task 3)

`runner-online`, `channel-liveness` and `download-count` have nothing live to observe until Phases 49 and 50. They are recorded as no-data, not claimed live. Phase 50 criterion 5 is the live due point.

### Reversibility note (Task 3 input)

Once live, the events route, the D1 database, the 30-day retention, the `events.powerbrowser.org` hostname plus DNS and the pinned-issue schema are public contracts. Changing them later is a migration, not an edit.

## Deviations from Plan

None in the tree: no tree file was changed other than this file. Two instruction corrections inside the pack (stale worktree path; `--remote` on `d1 execute`) and one scoped variant (one synthetic event instead of two admitted plus one synthetic) are stated in the pack where they apply. The watchdog-before-pin ordering follows plan 48-03 and BLOCKED.md.

## Threat Flags

None. No new network endpoint, auth path or schema was introduced; this plan adds a document only.

## Known Stubs

None.

## Not done, with reasons

- Tasks 2 and 3: need the owner's Cloudflare account, GitHub owner token, display host and a 26-hour clock.
- Authoritative `--quick` green: runs on the merged head in the main deploy worktree, not in this worktree.
- STATE.md, ROADMAP.md and REQUIREMENTS.md were not updated and no requirement is marked complete: the plan is not complete, and this run is one task on a side branch.

## Self-Check: PASSED

- This file is the only file written; no tree file under `scripts/`, `worker/`, `theia/`, `powerbrowser/`, `.github/`, `ledger/` or `upstream/` was touched.
- Brand scan green after staging: re-run at commit time (see the task report).

## Live state at parking (2026-11-07, recorded by Phase 59 plan 59-01)

Source: `.planning/CARRY-FORWARD-v1.7.md` section 2, "Live state at parking", and the phase 48 and
57 rows of its section 5 BLOCKED table. Chris did this work live on 2026-11-06/07. Plan 59-01
copied the record, redid nothing, and filled the operator-record rows above whose step was done
live. "done live" in that table means the owner step was done; it does not mean a registry live
row is green. The organisation is Deocracy.

Done live:

- Events Worker on events.powerbrowser.org with D1 `powerbrowser-events`; probes 200 synthetic,
  413, 429 (section A). The D1 id is not committed (OWNER-PASS section 3b).
- `DOWNLOAD_COUNT_SECRET` in the Worker and the bot environment; the synthetic probe secret set and
  probed (BLOCKED.md item 6).
- One zone rate-limit rule, 10 per 10 s per IP: the Free-plan form of the 60/min ruling (step A6).
- Maintenance issue #7 pinned (step B8).
- Watchdog applied, and disabled until the clock ticks (step D12).
- Crash Worker on crash.powerbrowser.org (probes 200 CrashID, 413, 429) and the R2 bucket
  `powerbrowser-crash-reports` (private, 30-day lifecycle): Phase 57's receiver (57 BLOCKED.md B3).

Parked, open:

- The 26-hour watchdog drill (step D14). The watchdog stays disabled until the scheduler clock
  ticks (43-05).
- The red-row plant (step B10).
- `tel06-error-delivery-live` on a clean tree (step C11). WINDOWS.md 33: the drill refuses a dirty
  tree.
- `GH_PAT` for the status repo `Deocracy/powerbrowser-status` (CF-01; the status page is Phase
  53's).

Not in the source, so not recorded: the wrangler version, the schema tail, the D1 row count, the
sweep render evidence (B9), the watchdog apply SHA, the 60-day probe dates (D13) and the secrets
record (E15). `status: partial` and `requirements-completed: []` stand.
