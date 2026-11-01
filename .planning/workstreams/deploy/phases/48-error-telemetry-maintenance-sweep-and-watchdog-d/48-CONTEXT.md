# Phase 48: Error telemetry, maintenance sweep and watchdog (D) - Context

**Gathered:** 2026-10-23
**Status:** Ready for planning
**Mode:** Auto-generated (discuss skipped via workflow.skip_discuss)

<domain>
## Phase Boundary

Error reports from users who opted in land in a 30-day store, and the owner learns from one pinned issue, or from an external watchdog, when any part of the release machinery stops.

Requirements: TEL-06, TEL-10, TEL-11, TRAIN-07, MON-01 (full text in `.planning/workstreams/deploy/REQUIREMENTS.md`).

Depends on: Phase 43 (train report job), Phase 47 (Cloudflare zone). Success criteria, external gate and research flag are as written in `.planning/workstreams/deploy/ROADMAP.md` Phase 48 section.

</domain>

<decisions>
## Implementation Decisions

### Already decided (owner, 2026-10-20)
- All owner decisions in REQUIREMENTS.md "Owner Decisions" are binding (SEED-002 §12 recommended defaults plus the research additions).
- Decision 8: static hosting on Cloudflare Pages; decision 13: no version facts and no `release.json` committed by any workflow; decision 15: Worker is clock only (detection, liveness, pin age and descriptor delay run in Actions).
- Decision 9: keep `--disable-crashreporter` through the first Windows release; native crash reporting (TEL-09/TEL-07/TEL-12) is out of scope here.
- INF-06: no Cloudflare token in the maintenance sweep; download counts are written through the telemetry Worker (TEL-11).
- D-77: no `schedule:` key in the product repo. The MON-01 watchdog lives in `powerbrowser-updates`, not here.

### Assumptions about unfinished dependencies (recorded per workstream instruction)
- A48-1: Phase 43 (train skeleton, INF-03/TRAIN-01..03/08/09) is pending. Plans assume the Phase 43 contract as written: one `release-train.yml` reconciler with a `report` job that is the only writer of tracking issues (GITHUB_TOKEN `issues: write`), a `maintenance` sweep step on `ubuntu-latest`, and `scripts/release-train.mjs` pure functions `derive/next/render` plus `--self-test`. Phase 48 adds the maintenance-sweep rows and the pinned `release-train: maintenance` issue render; it does not redesign the train.
- A48-2: Phase 47 (zone, INF-01/INF-06/DIST-03/INF-02/WEB-01..05, TEL-08) is pending. Plans assume the Phase 47 contract as written: Cloudflare zone for powerbrowser.org exists with 2FA, Email Routing works, `powerbrowser-updates` deploys to updates.powerbrowser.org, and the `events` hostname/DNS record is created by Phase 47. Phase 48 consumes the origin and the D1 database; it does not create the zone, move DNS, or run Pages deploys. If Phase 47 names a different `events` hostname, the allowlist `manifest: telemetry.endpoint` entry and the sweep's synthetic POST follow it.
- A48-3: Phases 49/50 (legion runner, release pipeline, first public release) are pending. Per ROADMAP Phase 48 external gate, the runner-online, channel-liveness and download-count sweep rows have nothing live to observe yet. Plans render their no-data state now; live values are Phase 50 criterion 5. No plan blocks on a live Release, a live runner, or live download counts.
- A48-4: Phase 41 waits on the owner (repos, Apps, second owner, 2FA, apply, probes, drills). Plans assume the GH-10 contract as written (bot App installed on `powerbrowser`, `powerbrowser-updates` and the Homebrew tap repo; clock App on `powerbrowser`) and read back live settings only where a check can run read-only. Every live write (wrangler deploy, D1 creation, rate-limit rule, DNS record, pinned-issue creation) is an owner action at a `checkpoint:human-action`; plans build everything locally and end with exact commands.
- A48-5: Phase 46 (update experience, TEL-06-adjacent egress) is pending. TEL-06 here is the Theia error-producer + loopback live-delivery row only; it does not change update prefs, the update channel, or the allowlist beyond the one `telemetry.endpoint` host entry it needs.

### Owner gates in this phase (stop points for autonomous execution)
- Creating the Cloudflare account with 2FA, enabling R2, requesting the D-U-N-S number (owner steps, no phase, no cost) are owner actions and are not in this phase.
- Every Cloudflare write (D1 database creation, Worker deploy, rate-limiting rule, DNS record for the events hostname), every GitHub write that needs an App or owner token (pinned-issue creation, `powerbrowser-updates` watchdog workflow), and the live 26-hour watchdog drill are owner actions. Plans build the Worker, the sweep logic, the watchdog workflow file, and all registry rows locally with `--self-test` plants, and end with one `checkpoint:human-action` listing the exact commands, after which live rows are run.
- Read-only `gh api` calls and unauthenticated reads (e.g. Codeberg mirror is Phase 53, not here) are allowed for research and read-back rows.

### Claude's Discretion
All other implementation choices are at Claude's discretion — discuss phase was skipped per user setting. Use the ROADMAP phase goal, success criteria, and codebase conventions to guide decisions.

</decisions>

<code_context>
## Existing Code Insights

Start from `.planning/research/v1.6-deploy/ARCHITECTURE.md` §§1/4 (reconciler, maintenance sweep list, watchdog-outside-product-repo, D1 download counts stay in a Worker) and `SUMMARY.md` Phase D, plus the S8 draft `.planning/drafts/distribution/S8-reports-bug-error-crash-PLAN.md` (events Worker shape, caps, rejection vocabulary, annotation allowlist, 30-day retention, privacy page, live-delivery drill pattern).

In-tree starting points the researcher must read this session:
- `theia/extensions/telemetry/` (sender, error report, error capture, logger, preferences, frontend module) and `scripts/verify-telemetry.mjs` (+ `--self-test` error-report case).
- `configuration.toml` `[telemetry]` (level off default, endpoint unset) and `scripts/generate.mjs` `emitTheiaTelemetry` / `mozillaEndpointPrefs`.
- `powerbrowser/endpoint-allowlist.json` (dispositions, `manifest` fields, `user-initiated` verdict).
- `scripts/verify-platform.sh` CHECKS registry (how a new row + `--self-test` is registered; `--quick` = no build/browser/display/network).
- `.github/workflows/` (`verify.yml`, `rebase-upstream.yml`, `notify-drill.yml`) and `scripts/verify-workflows.mjs` (the `workflows` row: no `schedule:`, legion label placement, SHA pins, guarded `workflow_run`, no event text in `run:`/`prompt:`) — the sweep and watchdog workflows must satisfy it.
- `docs/RELEASING.md`, `docs/RENEWALS.md`, `docs/PRIVACY.md` if present (TEL-08 privacy text lives in Phase 47; TEL-06/TEL-10/TEL-11 must agree with it on payload, retention, processor).

</code_context>

<specifics>
## Specific Ideas

- TEL-06: the Theia error producer sends version, buildID and OS with each report, and no message or stack. `[telemetry]` states the endpoint at level off so raising the preference is the opt-in. Preference description reads exactly: "Send error reports to PowerBrowser. When this is on, PowerBrowser sends the error type, file name, line number, version and operating system when something goes wrong. It never sends page content or error messages. Turning this on also lets installed VS Code extensions send their own telemetry." A loopback live-delivery row observes one POST from a running sidecar. Correct the S8 draft's `message` field.
- TEL-10: the telemetry Worker's `POST /events` validates the payload and writes to D1; a scheduled job deletes rows older than 30 days; one Cloudflare rate-limiting rule protects the route.
- TEL-11: the sweep records each Release asset's `download_count` daily by POSTing to an authenticated telemetry Worker route that writes D1; the shared secret is held only as a `bot` environment secret and as a Worker secret, each with a `docs/RENEWALS.md` row; the sweep holds no Cloudflare API token.
- TRAIN-07: one pinned `release-train: maintenance` issue re-rendered daily from the first tick after 06:00 UTC on a GitHub-hosted runner; comments only on red; initial rows runner-online, ESR pin age (>3 days behind with no matching Release = red), channel liveness, watchdog age, synthetic `/events` POST (2xx, row deleted or marked synthetic, else red), plus the TEL-11 download-count row. Runner-online, channel-liveness and download-count rows render no-data until Phases 49/50.
- MON-01: a `schedule:` watchdog workflow in `powerbrowser-updates` checks daily that the last `release-train` run is <26 h old and opens an issue in its own repo otherwise. Stopping the Worker cron for 26 h opens that issue. D-77 binds the product repo only.
- Research flag (open, SUMMARY): whether bot commits count as activity for GitHub's 60-day scheduled-workflow rule — matters to the watchdog repo. Researcher resolves as far as possible without the owner; whatever stays open becomes a plan-recorded probe, not a silent assumption.

</specifics>

<deferred>
## Deferred Ideas

None — discuss phase skipped.

</deferred>
