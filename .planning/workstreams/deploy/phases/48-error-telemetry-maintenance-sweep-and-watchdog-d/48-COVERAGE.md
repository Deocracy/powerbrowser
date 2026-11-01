# API Coverage — GitHub REST (sweep + watchdog) and Cloudflare control plane (deploy-time)

> Full coverage by default. Opt-outs are explicit, reasoned decisions.

Scope is the external-API surface Phase 48 touches. The phase writes no product analytics, mints no App token in the sweep, stores no state, and creates no GitHub App. Two external surfaces are integrated: GitHub REST (read facts, render one pinned issue, open one watchdog issue) and the Cloudflare control plane (deploy-time, owner-run only: D1, Worker deploy, secret, rate-limit rule, DNS record). The telemetry Worker's own HTTP routes (`POST /events`, authed download-count route) are produced artifacts, not an external integration; their contract is pinned by `scripts/verify-events-worker.mjs`, not by this matrix.

## GitHub REST — maintenance sweep and watchdog (read facts, write one issue body, comment only on red)

| capability | decision | reason |
|---|---|---|
| repos: list `FIREFOX_153_*esr_RELEASE` tags via matching-refs (ESR pin age) | INTEGRATE | |
| product-details `FIREFOX_ESR` cross-check only (never the sole source) | INTEGRATE | |
| releases: get latest Release, asset list, `download_count` per asset | INTEGRATE | |
| contents: get public `update.xml` per target (channel liveness byte-equal) | INTEGRATE | |
| MAR asset URLs: HEAD per URL (channel liveness) | INTEGRATE | |
| actions/runners: get runner list (runner-online; bot App `administration:read`) | INTEGRATE | |
| actions/workflows runs: get latest `release-train` run (watchdog age; last-train-run age for MON-01 file) | INTEGRATE | |
| synthetic POST to `events` origin, expect 2xx (synthetic row) | INTEGRATE | |
| issues: get + PATCH pinned `release-train: maintenance` body (render-from-facts only, never read back as state) | INTEGRATE | |
| issues: comment only on transition into red (report job) | INTEGRATE | |
| watchdog: open issue in `powerbrowser-updates` own repo when last train run ≥26 h old | INTEGRATE | |
| tracking-issue lock/assign/reopen (TRAIN-02 states) | OPT-OUT | not needed yet: Phase 43 owns tracking-issue lifecycle; Phase 48 adds only the pinned maintenance issue |
| cancel pending `release` deployment / SUPERSEDE (TRAIN-04) | OPT-OUT | explicitly out of scope: Phase 51 owns supersede and chemspill |
| renewals-due / repo-controls / Dependabot / CodeQL / Codeberg rows (TRAIN-11) | OPT-OUT | explicitly out of scope: Phase 51 extends the sweep; Phase 48 ships the six initial rows only |
| dispatch `release.yml` / `rebase-upstream.yml` from the sweep | OPT-OUT | not needed: sweep never dispatches builds; dispatch stays in the train's bump/release stages (Phases 43/49/50) |
| merge / approve environment / touch signing material | OPT-OUT | explicitly out of scope: fixer rules (Phase 52); sweep only reads and renders |
| mint App installation token inside sweep jobs | OPT-OUT | not needed: sweep uses `GITHUB_TOKEN` read-only plus the `bot`-env shared secret for the download-count POST; no App key leaves its job |

## Cloudflare control plane — deploy-time, owner-run only (no Cloudflare token in the sweep)

| capability | decision | reason |
|---|---|---|
| `wrangler d1 create` (telemetry database) | INTEGRATE | owner-run at the `checkpoint:human-action`; database id recorded verbatim |
| `wrangler d1 execute --file` (one-table schema + index) | INTEGRATE | owner-run; schema applied once, recorded |
| `wrangler deploy` (events Worker from `worker/`) | INTEGRATE | owner-run; deployed version id recorded |
| `wrangler secret put` (download-count shared secret as Worker secret) | INTEGRATE | owner-run; value never enters the tree or logs |
| rate-limiting rule create on the events route (per-IP budget, block) | INTEGRATE | owner-run in dashboard; threshold + period pasted verbatim into the operator record |
| DNS record create for the events hostname (proxied) | INTEGRATE | owner-run; Phase 47 owns the zone, Phase 48 consumes the origin |
| D1 `scheduled()` daily delete (`received_at < now - 30d`) | INTEGRATE | runs inside the telemetry Worker, asserted by the contract gate |
| R2 object write / MAR fallback bucket | OPT-OUT | explicitly out of scope: DIST-08/R2 is Phase 49; no minidump/R2 path here (native crash TEL-07/TEL-12 is Phase 57) |
| Pages deploy / `_redirects` / `functions/` / `_worker.js` | OPT-OUT | explicitly out of scope: Phase 47 owns Pages; updates host carries no Functions (asserted by `updates-repo-static` there) |
| Email Routing send (scheduler failure mail) | OPT-OUT | not needed: Phase 43 owns the scheduler clock mail; sweep/watchdog never send mail |
| Workers AI / Queues / KV / other bindings | OPT-OUT | not needed: D1 + rate-limit rule are the only bindings |

## Telemetry HTTP surface produced (not an external integration — contract-pinned, listed for completeness)

| capability | decision | reason |
|---|---|---|
| `POST /events` public: validate → D1 row (server time, no client id, admitted set only) | INTEGRATE | |
| authenticated download-count route: Bearer secret → D1 upsert | INTEGRATE | |
| malformed → 400, over-cap → 413, over-rate → 200 + discard reason | INTEGRATE | |
| every other method/path → 404, no body detail | INTEGRATE | |
| no credential, no client identifier anywhere in `worker/` | INTEGRATE | |
