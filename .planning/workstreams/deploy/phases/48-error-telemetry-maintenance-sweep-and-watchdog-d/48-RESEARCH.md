# Phase 48: Error telemetry, maintenance sweep and watchdog (D) - Research

**Researched:** 2026-10-23
**Domain:** Opt-in Theia error telemetry (producer → `/events` Worker → D1), daily release-train maintenance sweep with pinned issue, external watchdog in `powerbrowser-updates`
**Confidence:** HIGH for in-tree mechanics (every load-bearing claim was read this session); MEDIUM for the Worker/sweep/watchdog design (no live Cloudflare or GitHub writes were made); LOW for exact Cloudflare/Github platform versions and quota numbers (no network fetch was available this session — re-verify at plan time).

## Summary

Phase 48 lands the only path back from users (opt-in error reports) plus the two mechanisms that notice when the release machinery stops (a pinned maintenance issue and an external watchdog). All three halves already have a proven shape in the tree: the sender + error reporter + `verify-telemetry.mjs` gate (TEL-01/TEL-02/NG-067), the crash collector + `verify-crash-collector.mjs` contract gate (the template for the events Worker), and the `workflows` trust-boundary row (the guard every new workflow must pass).

Five facts change the plan's shape:

1. **The sender currently sends the error message — TEL-06 forbids it.** `sendErrorData` names the event `const name = typeof error === 'string' ? error : (error && error.message) || String(error);` [VERIFIED: theia/extensions/telemetry/src/browser/telemetry-sender.ts:147-154]. The error reporter already sends only `{type, source, line, column}` with the rule "Never the message and never a stack: Theia's file service puts full home-directory paths into error messages, page errors carry URLs, and stacks carry both" [VERIFIED: theia/extensions/telemetry/src/browser/telemetry-error-report.ts:5-13]. The S8 draft's `message` field is therefore corrected by deleting it: the event name becomes the fixed `frontend.uncaught-error` / `frontend.unhandled-rejection` constant and the message never leaves the machine.
2. **The preference description must be replaced verbatim, not paraphrased.** It currently reads `description: 'How much usage and error telemetry PowerBrowser sends to the configured endpoint.'` [VERIFIED: theia/extensions/telemetry/src/browser/telemetry-preferences.ts:32-44]. TEL-06 requires exactly: "Send error reports to PowerBrowser. When this is on, PowerBrowser sends the error type, file name, line number, version and operating system when something goes wrong. It never sends page content or error messages. Turning this on also lets installed VS Code extensions send their own telemetry." [VERIFIED: .planning/workstreams/deploy/REQUIREMENTS.md:192].
3. **There is no enrichment module yet.** `theia/extensions/telemetry/src/browser/` holds `telemetry-error-capture.ts`, `telemetry-error-report.ts`, `telemetry-frontend-module.ts`, `telemetry-logger.ts`, `telemetry-preferences.ts`, `telemetry-sender.ts` and no `telemetry-enrichment.ts` [VERIFIED: directory listing this session]. Version, buildID and OS therefore need one new derivation site plus a bounded admitted set the gate pins.
4. **The shipped endpoint is still unset.** `[telemetry]` carries `level = "off"` and no endpoint [VERIFIED: configuration.toml:104-105], the fragment is `{"level": "off", "endpoint": null}` [VERIFIED: generated/theia-telemetry.json:1-4], and the tracked block matches it [VERIFIED: theia/applications/browser/package.json:15-19]. Phase 48 states the endpoint (hostname created by Phase 47) while keeping level off, and `mozillaEndpointPrefs` already blanks the Gecko pref at off: `(level === 'off' || isUnset(rawEndpoint)) ? '' : assertEmittable('telemetry.endpoint', rawEndpoint)` [VERIFIED: scripts/generate.mjs:2647-2654].
5. **No Worker, no sweep, no watchdog exists yet.** There is no `worker/` directory [VERIFIED: `ls` this session], no `docs/PRIVACY.md` or `docs/RENEWALS.md` [VERIFIED: `ls docs/` this session], no `release-train.yml` (Phase 43 pending), and the allowlist carries no `telemetry.endpoint`-marked entry [VERIFIED: powerbrowser/endpoint-allowlist.json:1-293 read this session]. The events Worker follows the crash-collector contract idiom (`SUBMIT_PATH`, rejection vocabulary, caps, `RETENTION_DAYS = 30`, `ANNOTATION_ALLOWLIST`) [VERIFIED: scripts/crash-collector.mjs:54-93]; the sweep follows ARCHITECTURE §4.4's maintenance list [VERIFIED: .planning/research/v1.6-deploy/ARCHITECTURE.md:228-242]; the watchdog lives outside the product repo per D-77 [VERIFIED: .planning/workstreams/deploy/REQUIREMENTS.md:357].

**Primary recommendation:** Run in this order:
1. TEL-06 producer delta first (enrichment module, reporter + sender amendments, exact preference text, manifest endpoint + allowlist row, extended `verify-telemetry.mjs`), because every other half asserts against its payload.
2. TEL-10 events Worker + contract gate + D1 + rate-limit rule, reusing the crash-collector idiom (validate-before-write, 400/413/200-discard vocabulary, server-time rows, 30-day delete cron, no credential in code).
3. TEL-11 authenticated download-count route on the same Worker (shared secret in `bot` env + Worker secret, RENEWALS rows, sweep holds no Cloudflare token), with the sweep's download-count row rendering no-data until Phases 49/50.
4. TRAIN-07 maintenance sweep (first tick after 06:00 UTC, `ubuntu-latest`, render-from-facts-only, one transition per run, comment-only-on-red with an exactly-one-comment self-test plant) plus the MON-01 watchdog file (built here, applied in `powerbrowser-updates` by the owner at a `checkpoint:human-action`).
5. Privacy/processor string agreement with Phase 47's TEL-08 before any copy lands, so payload, retention, processor, hosts, privacy@ and postal address are identical everywhere.

Every new check is one registry row plus its `--self-test` sibling in `scripts/verify-platform.sh` (quick tier honest, full tier where a build, browser, display or network is needed).

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Error payload shape (no message/stack/path/URL) | Theia extension `@powerbrowser/telemetry` (`telemetry-error-report.ts` + new `telemetry-enrichment.ts`) | `verify-telemetry.mjs` admitted-set assertion | TEL-06: producer bounded at the source; gate derives keys from the tree |
| Level-off silence + opt-in | `telemetry-sender.ts` per-event live level read (`off` drops before queueing) | `mozillaEndpointPrefs` blank server at off; loopback drill negative half | Nothing leaves at shipped level; Gecko path gains nothing |
| Preference text | `telemetry-preferences.ts` (exact TEL-06 string, no internal identifier) | `verify-telemetry.mjs` exact-string assertion | User-facing copy rule; never paraphrase |
| Manifest endpoint | `configuration.toml [telemetry]` + `emitTheiaTelemetry` + fragment + tracked block | `theia-endpoints` coverage row + allowlist `manifest: telemetry.endpoint` row | One source (S8 three-part shape); stale output goes red |
| `/events` receiver + 30-day store | `worker/events-worker.mjs` (zero-dependency ES module, D1 binding) + `worker/wrangler.toml` | `scripts/verify-events-worker.mjs` contract gate (synthetic Requests + stub D1) | S8 idiom: importable under plain node, validate-before-write |
| Download counts | Same Worker, authenticated route → D1; sweep POSTs with shared secret | `verify-events-worker.mjs` 401-vs-200 plants; sweep self-test | INF-06: sweep holds no Cloudflare token |
| Abuse control | Cloudflare rate-limiting rule (operator) + in-Worker caps (body/batch/truncate/200-discard) | Operator record pastes threshold verbatim | Public client cannot hold a credential; bounded by construction |
| Maintenance sweep | `release-train.yml` `maintenance` + `report` jobs, logic in `scripts/release-train.mjs` (`derive/next/render` + `--self-test`) | Pinned `release-train: maintenance` issue (rendered view only) | ARCHITECTURE reconciler: derive from GitHub facts, at most one transition per run |
| Watchdog | `schedule:` workflow in `powerbrowser-updates` (built here, applied there by owner) | Issue opened in its own repo when last train run ≥26 h old | D-77 binds the product repo only; two clocks watch each other |
| Privacy/processor agreement | Phase 47 TEL-08 `/privacy` page (owner) | Phase 48 hands exact strings; Worker header + gate pin the same numbers | Payload, 30-day retention, Cloudflare-only processor, hosts, privacy@ + postal address identical |
| Trust boundary | `workflows` + `zizmor` quick rows | No `schedule:` in product repo; SHA pins; guarded `workflow_run`; no event text in `run:`/`prompt:` | GH-12/D-77 hold for every new workflow |

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
#### Already decided (owner, 2026-10-20)
- All owner decisions in REQUIREMENTS.md "Owner Decisions" are binding (SEED-002 §12 recommended defaults plus the research additions).
- Decision 8: static hosting on Cloudflare Pages; decision 13: no version facts and no `release.json` committed by any workflow; decision 15: Worker is clock only (detection, liveness, pin age and descriptor delay run in Actions).
- Decision 9: keep `--disable-crashreporter` through the first Windows release; native crash reporting (TEL-09/TEL-07/TEL-12) is out of scope here.
- INF-06: no Cloudflare token in the maintenance sweep; download counts are written through the telemetry Worker (TEL-11).
- D-77: no `schedule:` key in the product repo. The MON-01 watchdog lives in `powerbrowser-updates`, not here.

#### Assumptions about unfinished dependencies (recorded per workstream instruction)
- A48-1: Phase 43 (train skeleton, INF-03/TRAIN-01..03/08/09, release-train.yml reconciler + report job + scripts/release-train.mjs derive/next/render + self-test) is pending. Plans assume the Phase 43 contract as written: one `release-train.yml` reconciler with a `report` job that is the only writer of tracking issues (GITHUB_TOKEN `issues: write`), a `maintenance` sweep step on `ubuntu-latest`, and `scripts/release-train.mjs` pure functions `derive/next/render` plus `--self-test`. Phase 48 adds the maintenance-sweep rows and the pinned `release-train: maintenance` issue render; it does not redesign the train.
- A48-2: Phase 47 (zone, INF-01/INF-06/DIST-03/INF-02/WEB-01..05, TEL-08) is pending. Plans assume the Phase 47 contract as written: Cloudflare zone for powerbrowser.org exists with 2FA, Email Routing works, `powerbrowser-updates` deploys to updates.powerbrowser.org, and the `events` hostname/DNS record is created by Phase 47. Phase 48 consumes the origin and the D1 database; it does not create the zone, move DNS, or run Pages deploys. If Phase 47 names a different `events` hostname, the allowlist `manifest: telemetry.endpoint` entry and the sweep's synthetic POST follow it.
- A48-3: Phases 49/50 (legion runner, release pipeline, first public release) are pending. Per ROADMAP Phase 48 external gate, the runner-online, channel-liveness and download-count sweep rows have nothing live to observe yet. Plans render their no-data state now; live values are Phase 50 criterion 5. No plan blocks on a live Release, a live runner, or live download counts.
- A48-4: Phase 41 waits on the owner (repos, Apps, second owner, 2FA, apply, probes, drills). Plans assume the GH-10 contract as written (bot App installed on `powerbrowser`, `powerbrowser-updates` and the Homebrew tap repo; clock App on `powerbrowser`) and read back live settings only where a check can run read-only. Every live write (wrangler deploy, D1 creation, rate-limit rule, DNS record for the events hostname, pinned-issue creation, `powerbrowser-updates` watchdog workflow) is an owner action at a `checkpoint:human-action`; plans build everything locally and end with exact commands, after which live rows are run.
- A48-5: Phase 46 (update experience, TEL-06-adjacent egress) is pending. TEL-06 here is the Theia error-producer + loopback live-delivery row only; it does not change update prefs, the update channel, or the allowlist beyond the one `telemetry.endpoint` host entry it needs.

#### Owner gates in this phase (stop points for autonomous execution)
- Creating the Cloudflare account with 2FA, enabling R2, requesting the D-U-N-S number (owner steps, no phase, no cost) are owner actions and are not in this phase.
- Every Cloudflare write (D1 database creation, Worker deploy, rate-limiting rule, DNS record for the events hostname), every GitHub write that needs an App or owner token (pinned-issue creation, `powerbrowser-updates` watchdog workflow), and the live 26-hour watchdog drill are owner actions. Plans build the Worker, the sweep logic, the watchdog workflow file, and all registry rows locally with `--self-test` plants, and end with one `checkpoint:human-action` listing the exact commands, after which live rows are run.
- Read-only `gh api` calls and unauthenticated reads (e.g. Codeberg mirror is Phase 53, not here) are allowed for research and read-back rows.

### Claude's Discretion
All other implementation choices are at Claude's discretion — discuss phase was skipped per user setting. Use the ROADMAP phase goal, success criteria, and codebase conventions to guide decisions.

### Specific Ideas (from CONTEXT.md)
- TEL-06: the Theia error producer sends version, buildID and OS with each report, and no message or stack. `[telemetry]` states the endpoint at level off so raising the preference is the opt-in. Preference description reads exactly: "Send error reports to PowerBrowser. When this is on, PowerBrowser sends the error type, file name, line number, version and operating system when something goes wrong. It never sends page content or error messages. Turning this on also lets installed VS Code extensions send their own telemetry." A loopback live-delivery row observes one POST from a running sidecar. Correct the S8 draft's `message` field.
- TEL-10: the telemetry Worker's `POST /events` validates the payload and writes to D1; a scheduled job deletes rows older than 30 days; one Cloudflare rate-limiting rule protects the route.
- TEL-11: the sweep records each Release asset's `download_count` daily by POSTing to an authenticated telemetry Worker route that writes D1; the shared secret is held only as a `bot` environment secret and as a Worker secret, each with a `docs/RENEWALS.md` row; the sweep holds no Cloudflare API token.
- TRAIN-07: one pinned `release-train: maintenance` issue re-rendered daily from the first tick after 06:00 UTC on a GitHub-hosted runner; comments only on red; initial rows runner-online, ESR pin age (>3 days behind with no matching Release = red), channel liveness, watchdog age, synthetic `/events` POST (2xx, row deleted or marked synthetic, else red), plus the TEL-11 download-count row. Runner-online, channel-liveness and download-count rows render no-data until Phases 49/50.
- MON-01: a `schedule:` watchdog in `powerbrowser-updates` checks daily that the last `release-train` run is <26 h old and opens an issue in its own repo otherwise. Stopping the Worker cron for 26 h opens that issue. D-77 binds the product repo only.
- Research flag (open, SUMMARY): whether bot commits count as activity for GitHub's 60-day scheduled-workflow rule — matters to the watchdog repo. Researcher resolves as far as possible without the owner; whatever stays open becomes a plan-recorded probe, not a silent assumption.

### Deferred Ideas
None — discuss phase skipped.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description (abridged from REQUIREMENTS.md) | Research Support |
|----|---------------------------------------------|------------------|
| TEL-06 | Theia error producer sends version, buildID, OS with each report; no message or stack; `[telemetry]` states endpoint at level off; exact preference description; loopback live-delivery row observes one POST from running sidecar; S8 `message` field corrected | Reporter already `{type, source, line, column}` no-message/no-stack [VERIFIED: telemetry-error-report.ts:5-13]; sender currently sends `error.message` and must be amended [VERIFIED: telemetry-sender.ts:147-154]; preference text must be replaced verbatim [VERIFIED: telemetry-preferences.ts:32-44 vs REQUIREMENTS.md:192]; level-off blank-server semantics proven [VERIFIED: generate.mjs:2647-2654]; enrichment module absent so one new file + bounded set + drill (Patterns 1–2, Validation map) |
| TEL-10 | Telemetry Worker `POST /events` validates payload → D1; scheduled job deletes rows >30 days; one Cloudflare rate-limiting rule protects route | Crash-collector idiom reused: validate-before-write, 400/413/200-discard vocabulary, caps, `RETENTION_DAYS = 30` [VERIFIED: crash-collector.mjs:54-93]; S8 contract shape `Accept POST on the events path only; every other method and path is 404 with no body detail` [VERIFIED: S8-PLAN.md:288]; wrangler/D1/rate-limit versions below are ASSUMED (no network this session) and re-verified at plan time (Patterns 3–4) |
| TEL-11 | Sweep records each Release asset `download_count` daily via authenticated Worker route → D1; secret only in `bot` env + Worker secret with RENEWALS rows; sweep holds no Cloudflare token | Same Worker + new authed route; `bot` env already declared in Phase 41 settings [VERIFIED: `.github/settings/environment-bot.json` exists]; sweep secret handling mirrors fixer/bot split (ARCHITECTURE §2 table); download-count row renders no-data until Phases 49/50 per A48-3; 401-vs-200 gate plants (Patterns 3, 5) |
| TRAIN-07 | One pinned `release-train: maintenance` issue re-rendered daily from first tick after 06:00 UTC on GitHub-hosted runner; comments only on red; initial rows runner-online, ESR pin age, channel liveness, watchdog age, synthetic `/events` POST (2xx, deleted/marked synthetic else red) + download-count row; three rows render no-data now; self-test plants red row requiring exactly one comment | Reconciler + report-job + `derive/next/render` + `--self-test` assumed from Phase 43 (A48-1); maintenance list runs in Actions not Worker per CPU/subrequest caps [VERIFIED: ARCHITECTURE.md:228-242]; `issues: write` admitted only on `release-train.yml` job `report` and `triage.yml` [VERIFIED: verify-workflows.mjs:39-40,300-301]; comment-only-on-red + exactly-one-comment plant (Pattern 6) |
| MON-01 | `schedule:` watchdog in `powerbrowser-updates` checks daily last `release-train` run <26 h old, opens issue in own repo otherwise; stopping Worker cron 26 h opens that issue | D-77 binds product repo only [VERIFIED: REQUIREMENTS.md:357]; `no-schedule` rule `No workflow has a schedule event` [VERIFIED: verify-workflows.mjs:25-26] applies to product repo, so watchdog file is built here but lives/applied there; 60-day-rule activity question stays a plan-recorded probe (Open Questions; Pattern 7) |
</phase_requirements>

## Project Constraints (from CLAUDE.md)

- **Never fork or patch Theia core.** Theia-side additions are `@powerbrowser/*` extensions composed into the sidecar; upstream Theia is adopted by re-pinning, never editing. `scripts/diff-theia-core.sh` is the check. Phase 48 touches only `@powerbrowser/telemetry` extension sources.
- **Never modify Gecko outside the patch stack.** `upstream/` is fetched and never hand-edited; `git -C upstream diff` stays empty. No Gecko patch in this phase (buildID/version reach the frontend through the telemetry fragment and frontend enrichment, never through an upstream edit).
- **One anti-corruption layer.** Firefox internals only through `powerbrowser/shell/PowerBrowserAPI.sys.mjs`, catalogued in `powerbrowser/INTERNAL-APIS.md`; `scripts/check-internals-boundary.sh` enforces both halves. If buildID needs a privileged read, it goes through one new accessor + catalogue row, never a second importer.
- **Design for the bridge.** Nothing welds Theia to full-window presentation; `TabUriRegistry` exported shape stays asserted. Telemetry changes add no window, chrome, toolbar or address bar.
- **Repo path contains no space.** All new files use space-free names (`worker/events-worker.mjs`, `scripts/verify-events-worker.mjs`, `telemetry-enrichment.ts`).
- **Theia is the default GUI; stock browser chrome is reachable.** No custom browser chrome is authored. The "Report a Bug" command is Phase 53, not here.
- **Patches are regenerated, never text-edited.** No patch touched by this phase. If a fixer-relevant path is added later, it goes through `scripts/regenerate-patches.sh`.
- **The residual-brand scan is a permanent gate.** `node scripts/scan-brand-residue.mjs` must exit 0; it iterates `git ls-files`, so **stage new files before trusting a green scan**; the originating product may be named only in `inventory/brand-tokens.json`.
- **One verification driver, one registry.** `scripts/verify-platform.sh` is the only driver. Every new check is one registry row (`telemetry` extensions, `events-worker`, sweep rows, live-delivery rows). No sibling driver.
- **Derive from the tree and compare (set equality).** No hand-kept expectation list. Every new check gets a `--self-test` that plants each fault and must go red naming the drift.
- **Never assert absence of a log line your own instrumentation emits.** The live-delivery negative half (zero requests at level off) is admissible only beside the positive half in the same run that proves the emitter fires (S8 drill idiom).
- **No internal identifier in user-facing copy.** No pref key, sentinel, port, timeout or raw exception in user text. The TEL-06 preference description is an exact string — quote verbatim, never paraphrase. Failure lines end with a real on-screen next step; identifiers live in the diagnostics layer.
- **Builds run in Nix dev shells** (`nix develop .#firefox` / `.#theia`); `yarn` only inside the theia shell; `node` works outside. `--quick` rows use no build, browser, display or network and must stay green on the tree when they land.
- **Never touch `ledger/` or `scripts/verify-ng-NNN-*.mjs`. Commit paths explicit only if you commit (prefer NOT to commit; orchestrator commits).**
- **`verify-workflows.mjs` trust boundary holds for every new workflow:** no `schedule:` in the product repo; SHA-pinned admitted `uses:`; guarded `workflow_run`; no event text in `run:`/`prompt:` — plus the D-77 corollary that the watchdog's `schedule:` lives only in `powerbrowser-updates`.

## Standard Stack

No new npm/pip/cargo packages. The Worker uses runtime globals only; gates are plain node over repository files; wrangler is an operator tool run through `nix run`, never a flake input [VERIFIED: S8-PLAN.md:290 states `Do not add wrangler to either flake shell; it is an operator tool run once per deploy through nix run nixpkgs#wrangler`].

| Tool | Version | Purpose | Note |
|------|---------|---------|------|
| node | v24.9.0 [VERIFIED: `node --version` this session] | All new check scripts, Worker gate (plain-node import) | Same as existing rows |
| wrangler | 4.62.0 on nixos-unstable as checked 2026-09-06 [VERIFIED: S8-PLAN.md:290]; STACK records wrangler 4.151.3 / `@cloudflare/workers-types` 5.20261019.1 / `cloudflare/wrangler-action` v4.1.3 [VERIFIED: STACK.md:53-56] | D1 creation, schema apply, Worker deploy, tail | [ASSUMED] current pin — re-verify at plan time with `nix run nixpkgs#wrangler -- --version`; deploy runbook pins the version that ran in `worker/wrangler.toml` comments + operator record |
| Cloudflare Workers Free | 10 ms CPU per invocation incl. cron, 50 subrequests, 5 cron triggers/account, 100k req/day, 100 MB body [VERIFIED: prior research via ARCHITECTURE.md:15-16 and PITFALLS.md:179] | Scheduler clock + `/events` + D1 cleanup | [CITED: https://developers.cloudflare.com/workers/platform/limits/] — re-verify limits at plan time; design keeps Worker to dispatch + bounded `/events` + one daily delete |
| Cloudflare D1 | Free: 10 databases, 500 MB/database, 5 GB total, 7-day Time Travel [VERIFIED: STACK.md:57] | `events` + `download_counts` tables, 30-day retention | [CITED: https://developers.cloudflare.com/d1/platform/limits/] — [ASSUMED] current; schema applied by owner with `wrangler d1 execute --file` |
| Cloudflare rate limiting | One rule on the events route: per-IP budget over a window, action block [VERIFIED: S8-PLAN.md:303-304 states `a per-IP request budget over a one-minute window, action block`] | Abuse control in front of unauthenticated `/events` | [ASSUMED] exact dashboard/API shape — owner records threshold + period verbatim in operator record; in-Worker caps stay the second line |
| Cloudflare Pages | `_redirects` 2000 static + 100 dynamic; 200 rewrite same-site only [VERIFIED: STACK.md:58] | updates host (Phase 47); events hostname DNS (Phase 47) | Not built here; sweep's synthetic POST follows Phase 47's hostname (A48-2) |
| `universal-github-app-jwt` | 2.2.2 [VERIFIED: STACK.md:56] | Scheduler Worker App JWT (WebCrypto, PKCS#8) | Scheduler only (Phase 43); telemetry Worker holds no App key |
| GitHub Actions runners | `ubuntu-latest` = 24.04 [VERIFIED: STACK.md:163] | Sweep + report jobs; watchdog job in other repo | Sweep pinned to GitHub-hosted per CONTEXT; never legion |
| GitHub REST | `GET /repos/{r}/actions/runners` needs admin access [VERIFIED: STACK.md:169]; `GET .../actions/workflows/release-train.yml/runs?per_page=1` for watchdog | Runner-online row (bot App `administration:read`); watchdog last-run-age row | [CITED: https://docs.github.com/en/rest/actions/self-hosted-runners] — read-only `gh api` allowed |
| GitHub scheduled workflows | Disabled after 60 days without repository activity [VERIFIED: prior research via FEATURES.md:148, PITFALLS.md:380] | Watchdog liveness risk | [CITED: https://docs.github.com/en/actions/reference/workflows-and-events-that-trigger-workflows] — whether bot commits count as activity is OPEN (probe, not assumption) |
| zizmor | 1.29.0–1.31.1 range in prior research [VERIFIED: 41-RESEARCH.md:72, STACK.md:41] | Static audit of new workflow edits | Quick row already exists |

**Installation:** none in-repo. Operator runs `nix run nixpkgs#wrangler -- --version`, `wrangler d1 create`, `wrangler d1 execute --file`, `wrangler deploy` from the `worker/` directory at the `checkpoint:human-action`.

## Package Legitimacy Audit

No new packages. The events Worker imports nothing (`Request`, `Response`, `URL`, D1 binding only — S8 zero-dependency rule [VERIFIED: S8-PLAN.md:286-288]); both new gates are plain node over repository files; the branding/telemetry extensions gain no new registry dependency (the S8 `telemetry-enrichment.ts` precedent uses only `navigator.userAgent`, no workspace dependency is required for Phase 48's OS bucket). `wrangler` stays an operator tool, never a flake input or `package.json` dependency.

**Packages removed due to [SLOP] verdict:** none.
**Packages flagged as suspicious [SUS]:** none.

## Architecture Patterns

### System architecture diagram

```
Theia sidecar (@powerbrowser/telemetry)                Cloudflare                     GitHub
┌─────────────────────────────────────┐                ┌──────────────┐               ┌──────────────────────────────┐
│ window 'error' / 'unhandledrejection'│                │ events Worker│               │ release-train.yml (Phase 43) │
│  → TelemetryErrorCapture (existing)  │                │  POST /events│               │  maintenance job             │
│  → ErrorReporter.report()            │   POST JSON    │   validate   │  synthetic    │   (first tick after 06:00UTC, │
│     {type,basename,line,column,      │ ─────────────▶ │   → D1 rows  │ ◀── POST ───── │    ubuntu-latest)            │
│      version,buildID,OS}             │  {events:[…]}  │   30-day cron│   2xx expected │                              │
│     NO message/stack/path/URL        │  allow (opt-in)│   delete     │               │  report job (issues: write)  │
│  → PowerBrowserTelemetrySender       │                │  POST /dl    │               │   → PATCH pinned issue       │
│     level-off drops; error admitted  │                │   authed     │  daily POST   │      `release-train:         │
│     at crash/error/all               │                │   → D1 dl    │ ──secret──▶   │       maintenance`           │
└─────────────────────────────────────┘                │   rate-limit │               │      comment only on red     │
  manifest: [telemetry] endpoint stated, level off ─────▶  rule (1)   └──────────────┘               └──────────────┬─────────────┘
  allowlist: events host allow + manifest: telemetry.endpoint                                          │ render-from-facts-only
                                                                                                      ▼
                                                                                 ┌──────────────────────────────┐
                                                                                 │ powerbrowser-updates repo    │
                                                                                 │  watchdog.yml (schedule:)    │
                                                                                 │   last train run <26h?       │
                                                                                 │   else open issue HERE       │
                                                                                 └──────────────────────────────┘
```

### Recommended file layout (new or changed)

```
configuration.toml                        # [telemetry] endpoint stated (hostname from Phase 47), level stays off
scripts/generate.mjs                      # emitTheiaTelemetry (+version/buildID keys if fragment carries them),
                                          #   manifestEndpointSources already covers telemetry.endpoint [VERIFIED]
scripts/lib/config-schema.json            # telemetry.endpoint already https-required (verify at plan time)
generated/theia-telemetry.json            # fragment (git-ignored) gains version/buildID when decided
theia/applications/browser/package.json   # powerbrowserTelemetry block surgical copy (that key only)
theia/extensions/telemetry/src/browser/
  telemetry-enrichment.ts                 # NEW: ADMITTED_KEYS + osBucket() + version/buildID accessors, one site
  telemetry-error-report.ts               # MOD: ErrorReport gains version/buildID/OS; S8 message-field correction kept
  telemetry-error-capture.ts              # MOD: pass enrichment into report() (wiring only, still no message/stack)
  telemetry-sender.ts                     # MOD: amend never-enriches paragraph; name = fixed event constant path
  telemetry-preferences.ts                # MOD: exact TEL-06 description verbatim
powerbrowser/endpoint-allowlist.json       # + events host {allow, manifest: telemetry.endpoint, hand reason}
worker/events-worker.mjs                  # NEW: zero-dep fetch handler (S8 shape + download-count route + 30-day sweep)
worker/wrangler.toml                      # NEW: D1 binding, route, compatibility date, no secret, runbook comments
scripts/verify-events-worker.mjs          # NEW: contract gate + --self-test (one fault per rule, control first)
scripts/verify-telemetry.mjs              # EXTEND: admitted-set, exact description, level-off blank server, enrichment bound
scripts/verify-telemetry-live-delivery.mjs# NEW (or S8 name): full-tier loopback drill + quick analyzer self-test
scripts/release-train.mjs                 # EXTEND (Phase 43 file): maintenance derive/next/render + --self-test plants
.github/workflows/release-train.yml       # EXTEND (Phase 43 file): maintenance + report jobs (no schedule:, ubuntu-latest)
powerbrowser-updates/.github/workflows/watchdog.yml  # NEW SOURCE built here, applied there by owner
docs/RENEWALS.md                          # + bot-env secret row + Worker-secret row (+ D1/billing rows if any)
docs/PRIVACY.md                           # Phase 47-owned; Phase 48 hands exact payload/retention/processor/hosts strings
scripts/verify-platform.sh                # + rows (telemetry extensions, events-worker pairs, live-delivery pair, sweep pair)
```

### Pattern 1 — TEL-06 producer delta (message-field correction + bounded enrichment)

Current reporter sends `typeOf(error)`, `baseName(filename)`, `line`, `column` and already excludes message/stack/path [VERIFIED: telemetry-error-report.ts:48-100]. Current sender names the event from `error.message` [VERIFIED: telemetry-sender.ts:147-154] — that is the S8 `message` leak in miniature and the first edit: the error path keeps the fixed constants `UNCAUGHT_ERROR_EVENT = 'frontend.uncaught-error'` / `UNHANDLED_REJECTION_EVENT = 'frontend.unhandled-rejection'` [VERIFIED: telemetry-error-report.ts:18-19] as the wire `name`, with `type` (constructor name, `IDENTIFIER`-sanitised, path-carrying names → `'unknown'`) in `data`. The envelope `{kind, name, data, at}` stays (sender batching/retry/level idiom unchanged); the *content* becomes `{type, basename, line, column, version, buildID, OS}` with no `message`/`stack`/path/URL key anywhere.

Enrichment lives in exactly one new module (`telemetry-enrichment.ts`, S8 task-2 shape): `ADMITTED_KEYS = ['type','source','line','column','version','buildID','os']` (wire names follow CONTEXT `basename`/`OS` display names; exact wire spellings pinned by the gate's derivation, never by a kept copy), `osBucket()` from `navigator.userAgent` (one of three platform names + fallback, header cites S8 P1: spawn env carries no identity, backend deletes `POWERBROWSER_*`), and `version`/`buildID` accessors reading the baked `powerbrowserTelemetry` fragment (construction-time read, fail-closed to off/undefined like `readTelemetryConfig()` [VERIFIED: telemetry-frontend-module.ts:37-46]). `version` derives from the Phase 40 `releaseIdentity()` (`v<ESR>-<revision>` via `esrVersion`/`revision` [VERIFIED: generate.mjs:2796-2807]) as baked into the fragment; `buildID` is baked the same way at package/build time if the generator cannot know it at `generate` time (plan decides fragment-vs-build-time, gate pins whichever is chosen). `mozillaEndpointPrefs` keeps blanking `toolkit.telemetry.server` at off [VERIFIED: generate.mjs:2647-2654], and the endpoints gate keeps asserting the allowlist `expect` agreement [VERIFIED: verify-theia-endpoints.mjs:32-39,168-170].

### Pattern 2 — Live-delivery loopback row (S8 drill, corrected payload)

Reuse the S8 drill shape [VERIFIED: S8-PLAN.md:362-387]: bind a loopback HTTP server on a free port with marker path segment (`pb-drill-events`), point the frontend at it by rewriting the application `package.json` frontend config, rebuild only the frontend bundle inside the Nix theia shell, arm the level via the drill config dir (sender reads level live per event), launch the built binary through the BiDi harness on a temp profile, throw an uncaught error + an unhandled rejection from page script, force flush by batch size or interval, assert ≥1 POST, `content-type: application/json`, body `{events:[…]}` carrying both events with exactly the admitted keys and no message/stack/path/URL. Negative half in the same run only: level off → zero requests in the same budget (admissible because the positive half proved the emitter fires). `finally` restores the tracked file **and** rebuilds the bundle, then greps the built bundle for the marker (zero hits) — the bundle is untracked so `git diff` proves nothing. Analyzer is a pure function over the captured list with a quick-tier `--self-test` (missing POST, stack plant, unadmitted-key plant, full-path plant, empty capture — each red naming the drift, control green first).

### Pattern 3 — Events Worker contract (crash-collector idiom, no-key public route)

One zero-dependency ES module exporting a `fetch` handler, importable under plain node (same property that makes the crash collector testable [VERIFIED: crash-collector.mjs:19-25]). Contract, in order: accept POST on the events path only (every other method/path → 404, no body detail); validate `content-type: application/json`, `Content-Length` vs `MAX_BODY_BYTES`, parse, require top-level `{events: [...]}` array vs `MAX_EVENTS`, require each event object with admitted keys only; reject malformed → 400 with fixed short reasons, over-cap → 413, over-rate → 200 with discard reason (soft no, no retry-into-queue); truncate each stored string at stated length; drop (never store) any property outside the admitted set; write one D1 row per admitted event with server-assigned `received_at` and no client-supplied identifier; hold no credential and read no configured key (header states credentiallessness as a shape-tested fact, matching the S8 credential-assertion idiom). Caps, retention (`RETENTION_DAYS = 30`, matching `RETENTION_DAYS` in the collector [VERIFIED: crash-collector.mjs:76-77]) and vocabulary mirror `docs/CRASH-POLICY.md` voice so the privacy page and the Worker cannot state different numbers — the gate derives both sides and fails distinctly on empty derivation.

D1 schema (one table `events`, one table `download_counts`): `id INTEGER PK, received_at INTEGER (server ms), type TEXT, basename TEXT, line INTEGER NULL, column INTEGER NULL, version TEXT, buildid TEXT, os TEXT`; `download_counts(asset TEXT, tag TEXT, download_count INTEGER, received_at INTEGER, PRIMARY KEY(asset, day))` — plan finalises exact DDL; the gate pins whatever ships by driving the handler against a stub D1 and asserting row shape. Scheduled cleanup: one Worker `scheduled()` cron (daily) executing `DELETE FROM events WHERE received_at < now - 30d` (+ same for download counts or keep latest-per-asset per plan); the *scheduler dispatch* cron (hourly `workflow_dispatch`, Phase 43) is a different cron on a different Worker — do not conflate them (see Validation map).

### Pattern 4 — Rate limiting + deploy runbook (operator-owned, recorded verbatim)

One Cloudflare rate-limiting rule on the events route (per-IP budget over a one-minute window, action block — S8 operator shape [VERIFIED: S8-PLAN.md:303-304]); the Worker's header names it and the operator record pastes threshold + period verbatim so a claimed control that was never configured goes red by inspection. Deploy descriptor (`worker/wrangler.toml`) carries the D1 binding, the events route, compatibility date and no secret, with the runbook in comments: pinned wrangler version, `d1 create`, `d1 execute --file` schema apply, `deploy`, rule creation, one synthetic POST verify (200 + one D1 row; over-cap body → 413; burst past rule → blocked). `wrangler` never enters a flake shell [VERIFIED: S8-PLAN.md:290].

### Pattern 5 — TEL-11 download-count route (authed, secret-scoped, tokenless sweep)

Same Worker, second route (e.g. `POST /download-counts` — plan fixes the path): requires `Authorization: Bearer <shared-secret>` compared constant-time against the Worker secret; missing/wrong → 401 with no body detail (self-test plants unauthenticated POST → 401, and asserts the sweep's no-data path renders without calling it). Body `{asset, tag, download_count}` validated (types, ranges, length truncations) → upsert into D1. Secret held in exactly two places: `bot` environment secret (sweep job mints/reads it; `bot` env already declared [VERIFIED: `.github/settings/environment-bot.json` exists]) and Worker secret (`wrangler secret put`); each gains a `docs/RENEWALS.md` row (Phase 42 owns the file; Phase 48 adds the two rows). The sweep job holds no Cloudflare API token (INF-06): its only credential is the `bot`-scoped shared secret, which can only write download counts, never manage the zone. The sweep's download-count row POSTs one aggregated payload per asset per day (not per download), so volume is trivial.

### Pattern 6 — Maintenance sweep (render-from-facts, one transition, comment-only-on-red)

`maintenance` job (first tick after 06:00 UTC — the scheduler dispatches hourly and the job runs the sweep only when `now >= today 06:00 UTC` and no sweep ran today; `ubuntu-latest`; `contents:read` + narrow per-step scopes; `bot` env only where the runner-online probe needs `administration:read`) derives each row from live GitHub facts (never reads the issue body as state — body is `render(state)` output plus a `<!-- release-train:maintenance … -->` debug snapshot, PATCHed only when bytes differ). One transition per release per run is N/A here (maintenance has no per-release states); the analogue is one PATCH + at most one comment per run. Comment rule: comment (with owner mention/assignment per plan) only on a transition into red; a self-test plant forces one row red and requires exactly one comment, plus a staying-red run requiring zero new comments. Initial rows: `runner-online` (bot App `permission-administration: read`; no-data until legion registers in Phase 49), `esr-pin-age` (list `FIREFOX_153_*esr_RELEASE` tags, major guard, product-details cross-check only; red when a newer tag than the pin is >3 days old with no matching Release), `channel-liveness` (public `update.xml` byte-equal + MAR HEAD + version = latest Release; no-data until Phase 49/50), `watchdog-age` (last watchdog run age), synthetic `/events` POST (2xx expected; row deleted or marked synthetic; else red — plan marks it so real user reports and the synthetic probe never mix in D1 queries), `download-count` (TEL-11; no-data until Phases 49/50). Live values for the three deferred rows are Phase 50 criterion 5 (A48-3).

### Pattern 7 — Watchdog outside the product repo (D-77 compliant)

New workflow file (source built + self-tested in the product tree, applied to `powerbrowser-updates` by the owner): `schedule:` daily (e.g. `cron: '17 6 * * *'` — plan fixes the minute), `ubuntu-latest`, read-only token, one job: `GET /repos/DeBIOS-Foundation/powerbrowser/actions/workflows/release-train.yml/runs?per_page=1` (public repo — unauthenticated or `GITHUB_TOKEN` read), assert latest run started <26 h ago (started-at, not conclusion — a failing-but-running train is alive), else open an issue in the watchdog repo itself (`actions/github-script` or `gh`, SHA-pinned, title `release-train has not run in 26 h`, body with last-run link + timestamps). Stopping the scheduler cron 26 h therefore opens that issue (success criterion 4 — the live drill is an owner action: disable scheduler cron / pause dispatches, wait 26 h, observe the issue, re-enable). No `schedule:` is added to the product repo, so the `workflows` row stays green. Mirror the product trust boundary in the watchdog file anyway (SHA pins, no event text in `run:`, least-privilege `permissions:`) so a later audit cannot fault it. Keep the watchdog repo active by design (descriptor commits every ~2 weeks + watchdog issues); the 60-day-disable question stays a recorded probe (Open Questions).

### Anti-patterns (do not do)

- Do not send `message`, `stack`, full path, page URL, cookie, account, install id, or any client-supplied identifier — the reporter already sanitises constructor names via `IDENTIFIER` and basenames via `FILE_NAME` [VERIFIED: telemetry-error-report.ts:35-38]; deleting either guard re-opens the path leak the NG-067 self-test pins.
- Do not state the endpoint without keeping level off, and do not let `toolkit.telemetry.server` become non-blank at off (the endpoints gate asserts the agreement).
- Do not paraphrase the TEL-06 preference description; it is an exact string with a gate assertion.
- Do not put a credential, token, secret name, or client identifier in `worker/` (shape-tested like S8); abuse control is the rate-limit rule + caps, not a shipped key.
- Do not give the sweep a Cloudflare token; download counts go through the authed Worker route only.
- Do not add `schedule:`, legion labels, App-token steps, `contents: write`, caches, or event text in `run:`/`prompt:` to any product-repo workflow the sweep touches.
- Do not read the pinned issue body back as state, do not comment except on a transition into red, and do not mix the synthetic probe row into real telemetry queries.
- Do not log or store the download-count shared secret (diagnostics carry identifiers; user copy carries none of them).

## Don't Hand-Roll

- **D1 client / ORM in the Worker.** Use the runtime D1 binding (`env.DB.prepare(...).bind(...)`) directly. A bundled client exceeds the 10 ms CPU budget class and cannot be imported under plain node for the gate.
- **JWT / App-token minting in the telemetry Worker.** The telemetry Worker holds no GitHub credential at all. Only the scheduler Worker mints (Phase 43, `universal-github-app-jwt` 2.2.2 [VERIFIED: STACK.md:56]).
- **Custom rate-limiter in the Worker as the only line.** The Cloudflare rate-limiting rule is the control; in-Worker caps (body/batch/truncate/200-discard) are the second line (S8 header idiom).
- **Custom cron/state store for the sweep.** Scheduling is the hourly scheduler dispatch + first-tick-after-06:00-UTC gate; state is GitHub facts; the issue is a rendered view. No stored state, no second clock.
- **Custom markdown renderer for the pinned issue.** `render(state)` is string concatenation over derived facts (Phase 43 `render` idiom); the body comment block is a debug snapshot, never input.
- **Custom HTTP client in sweep/watchdog jobs.** Use `gh api` (read-only where possible) + `actions/github-script` SHA-pinned; validate dispatched inputs (tag regex, release-key ordering) per TRAIN-01.
- **Enrichment re-derivation.** One module (`telemetry-enrichment.ts`); the gate requires the produced key set ⊆ admitted set. A second OS/version copy in branding or elsewhere is the drift this rule exists to prevent.

## Common Pitfalls

1. **S8 `message` field ships.** The draft's enrichment task sends `message` [VERIFIED: S8-PLAN.md:325-329 describes `message text` in the Worker-adjacent tasks]; TEL-06 explicitly excludes it. Correction: delete the field at the producer (fixed event names + `type` in data), enforce server-side by dropping any `message`/`stack` property, and pin both halves with the error-report self-test plants (`/message|stack|Unable|self-test|notes|\//` tripwire idiom [VERIFIED: verify-telemetry.mjs:318]).
2. **Paraphrased preference description.** The exact 3-sentence string is a success criterion. Gate asserts byte equality; self-test plants a one-word change → red naming the preference.
3. **`toolkit.telemetry.server` goes live at level off.** The generator blanks it at off [VERIFIED: generate.mjs:2647-2654]; the endpoints gate asserts the allowlist `expect` agreement. Any new telemetry fragment key must not disturb this.
4. **Endpoint stated but allowlist row missing/stale.** `manifestEndpointSources` already emits `telemetry.endpoint` [VERIFIED: generate.mjs:2713]; steps 2–3 of the endpoints gate fail naming the host/entry [VERIFIED: verify-theia-endpoints.mjs:141-166]. Add the `allow` + `manifest: telemetry.endpoint` row in the same commit as the manifest change.
5. **Unattended `user-initiated` mis-disposition for the events host.** Error reports at level `error` fire without a per-event click → disposition must be `allow` (like the sidecar loopback `127.0.0.1` allow rationale [VERIFIED: endpoint-allowlist.json:80-83]), not `user-initiated`.
6. **Synthetic probe pollutes real telemetry.** Mark/delete the synthetic row (CONTEXT specifics) and filter it in every D1 query the plan writes; the gate plants a synthetic-marked event and requires it excluded from the maintainer query.
7. **Comment on every sweep run (notification spam).** Comment only on transitions into red; staying red or going green-red-green flapping must not re-comment (self-test: plant red → exactly one comment; re-run same red → zero new comments).
8. **Watchdog watches the wrong clock.** It asserts the last *release-train run* age (<26 h), not the telemetry cleanup cron. Stopping the telemetry Worker's delete cron must never page the owner via the watchdog; it surfaces via the sweep's own rows.
9. **60-day scheduled-workflow disable assumed away.** GitHub disables scheduled workflows after 60 days without repository activity. `powerbrowser-updates` receives descriptor commits ~2-weekly, but whether bot commits count is unproven — plan records the probe (Open Questions), never a silent assumption.
10. **Registry row that cannot go red.** Every row derives from the tree (fragment vs manifest, block vs fragment, admitted set vs enrichment module, issue body vs facts) and compares as set equality; self-tests plant each fault with the control green first (CLAUDE.md rule).
11. **Staged-but-invisible brand scan.** `scan-brand-residue.mjs` iterates `git ls-files` — stage `worker/`, new scripts and extension files before trusting green (CLAUDE.md trap, hit for real).
12. **Trust-boundary regression in new workflow edits.** `release-train.yml` maintenance/report jobs must keep: no `schedule:`, hosted labels only, `issues: write` only on `report`, SHA-pinned admitted `uses:`, guarded `workflow_run`, no event text in `run:`/`prompt:`. The `workflows --self-test` plants each fault class [VERIFIED: verify-workflows.mjs:96-104 rule list + self-test fixtures].

## Code Examples

Quoted verbatim from this session's reads (the shapes plans imitate):

**Sender envelope + level gating (keep; amend the naming call site):**
```ts
// [VERIFIED: theia/extensions/telemetry/src/browser/telemetry-sender.ts:135-154]
/** Usage path: admitted only at level `all`. Never throws. */
sendEventData(eventName: string, data?: Record<string, any>): void { ... }
/** Error path: admitted at every level but `off`. Never throws. */
sendErrorData(error: Error | string, data?: Record<string, any>): void {
    try {
        const name = typeof error === 'string' ? error : (error && error.message) || String(error);
        this.enqueue('error', name, data);
```
Plan change: error-hook call sites pass the fixed `UNCAUGHT_ERROR_EVENT` / `UNHANDLED_REJECTION_EVENT` constant as the event name and put `typeOf(value)` in `data.type` — the `error.message` expression never reaches the wire.

**Reporter admitted shape (keep; extend with version/buildID/OS):**
```ts
// [VERIFIED: theia/extensions/telemetry/src/browser/telemetry-error-report.ts:27-38]
export type ErrorReport = {
    type: string;
    source?: string;
    line?: number;
    column?: number;
};
const IDENTIFIER = /^[A-Za-z_$][\w$]{0,63}$/;
const SCRIPT_URL = /^(https?|file):\/\//i;
const FILE_NAME = /^[\w.-]{1,100}$/;
```
```ts
// [VERIFIED: theia/extensions/telemetry/src/browser/telemetry-error-report.ts:78-90]
readonly onError = (event: unknown): void => {
    this.report(UNCAUGHT_ERROR_EVENT, {
        type: typeOf(read(event, 'error')),
        source: baseName(read(event, 'filename')),
        line: position(read(event, 'lineno')),
        column: position(read(event, 'colno')),
    });
};
```

**Exact preference description (TEL-06, verbatim — the gate asserts this byte-for-byte):**
```
Send error reports to PowerBrowser. When this is on, PowerBrowser sends the error type, file name, line number, version and operating system when something goes wrong. It never sends page content or error messages. Turning this on also lets installed VS Code extensions send their own telemetry.
```
[VERIFIED: .planning/workstreams/deploy/REQUIREMENTS.md:192]

**Level-off blank server (keep):**
```ts
// [VERIFIED: scripts/generate.mjs:2647-2654]
const rawEndpoint = config.telemetry?.endpoint;
const server = (level === 'off' || isUnset(rawEndpoint)) ? '' : assertEmittable('telemetry.endpoint', rawEndpoint);
```

**Manifest endpoint source (already covers the new host):**
```ts
// [VERIFIED: scripts/generate.mjs:2697-2713]
take('telemetry.endpoint', config.telemetry?.endpoint);
for (const key of ['release_notes', 'update', 'crash_report', 'homepage', 'search']) {
    take(`urls.${key}`, config.urls?.[key]);
}
```

**Collector contract idiom the Worker imitates (validate → throttle → allowlist → store → sweep → respond):**
```ts
// [VERIFIED: scripts/crash-collector.mjs:54-93]
export const SUBMIT_PATH = '/submit';
export const MINIDUMP_PART_NAME = 'upload_file_minidump';
export const EXTRA_PART_NAME = 'extra';
export const REASON_OVERSIZED = 'oversized_body';
export const THROTTLE_RULE = 'throttled_per_minute_cap';
export const MAX_PARTS = 16;
export const RETENTION_DAYS = 30;
export const ANNOTATION_ALLOWLIST = Object.freeze([...]);
export const MAX_ANNOTATION_BYTES = 4096;
```

**Trust boundary the sweep/watchdog edits must keep:**
```js
// [VERIFIED: scripts/verify-workflows.mjs:25-26,96]
//  no-schedule    No workflow has a schedule event (`on` as a string, an
//                 array or a map normalises to one event set).
const RULES = ['uses-pinned', 'uses-admitted', 'admission-used', 'no-schedule', 'runner', 'legion', 'claude-code-action', 'issues-write', 'workflow-run-guard', 'workflow-run-chain', 'write-trio', 'no-pr-trigger', 'no-cache', 'event-text'];
```
```js
// [VERIFIED: scripts/verify-workflows.mjs:300-301]
if (eff.issues === 'write' && !((file === 'release-train.yml' && jobId === 'report') || file === 'triage.yml')) {
```

## State of the Art

- **Cloudflare Workers + D1 + rate limiting (2026).** Workers Free caps (10 ms CPU incl. cron, 50 subrequests, 5 crons/account, 100k req/day) force the clock-only scheduler and a bounded `/events` handler [VERIFIED: prior research in ARCHITECTURE.md:15-16; CITED: https://developers.cloudflare.com/workers/platform/limits/]. D1 Free (10 DBs, 500 MB/DB) fits an error-report + download-count store with a daily 30-day `DELETE` [VERIFIED: STACK.md:57; CITED: https://developers.cloudflare.com/d1/platform/limits/]. One IP-based rate-limiting rule is the documented abuse control for a public JSON receiver [ASSUMED shape — confirm dashboard/API at plan time; CITED: https://developers.cloudflare.com/waf/rate-limiting-rules/]. `wrangler` version and the D1 `execute --file` flow are operator-run [ASSUMED current pin — `nix run nixpkgs#wrangler -- --version` at plan time].
- **GitHub Actions trust + scheduled-workflow lifecycle (2026).** No `schedule:` in the product repo (D-77); `workflow_run` single-level wake only with `head_repository.full_name == github.repository` guard; SHA-pinned admitted actions; `issues: write` confined to the train `report` job + triage [VERIFIED: verify-workflows.mjs:36-56 rule header]. Scheduled workflows disable after 60 days without repository activity [VERIFIED: prior research FEATURES.md:148; CITED: https://docs.github.com/en/actions/reference/workflows-and-events-that-trigger-workflows] — the open item is strictly whether bot commits count as activity (Open Questions).
- **Competitor precedent.** Every MAR-updating competitor keeps descriptors in a separate repo as static files; Floorp's public hold check (byte-equality) is the direct precedent for `channel-liveness`; Mullvad's per-release issue is the precedent for tracking issues; no competitor runs a single orchestrator or an AI fixer [VERIFIED: FEATURES.md:11-29]. Zen's CVE-2026-41431 (MAR verification stripped) is why the trust path (SEC-05/SEC-07, already in other phases) stays separate from this phase [VERIFIED: FEATURES.md:24].
- **Privacy posture.** Opt-in JS-error reports only, no analytics; adoption read from download counts [VERIFIED: REQUIREMENTS.md:372]. TEL-08 (`/privacy`) is Phase 47; TEL-06/TEL-10/TEL-11 must state the identical payload, 30-day retention, Cloudflare-only processor, unattended hosts, privacy@ + postal address (Privacy section below).

## Assumptions Log

| # | Assumption | Why needed | How discharged |
|---|------------|------------|----------------|
| A48-R1 | Phase 43 contract as written (reconciler, `report` sole writer, `maintenance` on `ubuntu-latest`, `derive/next/render` + `--self-test`) | Sweep/watchdog build on it | A48-1; plans re-verify the file exists at plan time, else block |
| A48-R2 | Phase 47 names the `events` hostname + DNS + D1; Phase 48 follows it | Endpoint value, allowlist host, synthetic POST target | A48-2; if hostname differs, all three follow it (no replan) |
| A48-R3 | Runner-online, channel-liveness, download-count rows render no-data now; live values Phase 50 criterion 5 | Nothing live to observe (no runner/Release yet) | A48-3; rows exist + self-tests prove the no-data vs live branch |
| A48-R4 | GH-10 Apps as written; every live write is an owner `checkpoint:human-action` | No App/owner token in this session | A48-4; plans end with exact commands |
| A48-R5 | TEL-06 here is producer + loopback row only; no update-pref/channel/allowlist change beyond `telemetry.endpoint` | Phase 46 owns the rest | A48-5 |
| A48-R6 | wrangler/D1/rate-limit versions + quota numbers as in STACK/S8 (4.62.0 vs 4.151.3 conflict noted) | No network this session | Re-run `nix run nixpkgs#wrangler -- --version` + open the limits pages at plan time; pin what ran in `wrangler.toml` comments + operator record |
| A48-R7 | `version` = release display (`v<ESR>-<revision>` family) and `buildID` = Gecko build identifier, both baked into the `powerbrowserTelemetry` fragment (or build-time packaging value) for the frontend to read | Frontend has no privileged Gecko read today | Plan fixes fragment-vs-build-time; gate pins whichever is chosen; if a privileged read is needed it goes through one `PowerBrowserAPI.sys.mjs` accessor + catalogue row |
| A48-R8 | Watchdog repo (`powerbrowser-updates`) stays active via ~2-weekly descriptor commits + watchdog issues, so its `schedule:` workflow is not disabled | 60-day rule | Probe recorded (Open Q1); never silently assumed |
| A48-R9 | `docs/RENEWALS.md` / `docs/PRIVACY.md` owned by Phases 42/47; Phase 48 only adds/hand-offs rows/strings | Files absent in this tree [VERIFIED: `ls docs/`] | Plans coordinate the handoff; gate pins numbers both sides |

## Open Questions (RESOLVED: Q3, Q4, Q5 — decided by the Phase 48 plan set; Q1, Q2, Q6, Q7 stay open with in-plan handling)

| # | Question | Status | Recommended resolution |
|---|----------|--------|------------------------|
| Q1 | Do bot commits count as activity for GitHub's 60-day scheduled-workflow rule? (SUMMARY research flag; CONTEXT specifics) | OPEN — docs define no "activity"; no owner probe possible in this session | Plan records a probe: after the watchdog lands, record the repo's last-commit/last-run dates and observe one 60-day window; meanwhile keep the repo active by design (descriptor commits + watchdog issues). Never assume yes. |
| Q2 | Which `events` hostname does Phase 47 create? | OPEN (Phase 47 pending) | Plans parameterise on it (A48-2): manifest endpoint, allowlist host, synthetic POST and operator record all follow the Phase 47 name. |
| Q3 | Fragment-vs-build-time for `version`/`buildID` in the frontend? | RESOLVED (2026-10-23, plan 48-01): bake both into `powerbrowserTelemetry` fragment via `releaseIdentity()` at generate time (`version` = `esrVersion`, `buildID` = `releaseKey`); the gate compares against the same derivation | Bake both into `powerbrowserTelemetry` fragment via `releaseIdentity()` where known at generate time; if `buildID` is only known at build time, extend the packaging step to rewrite that key and extend `verify-telemetry.mjs` to compare against the same derivation. Gate pins the choice. |
| Q4 | Exact wire spellings (`basename` vs `source`, `OS` vs `os`) and synthetic-row marking (`deleted` vs `marked synthetic`)? | RESOLVED (2026-10-23, plans 48-01/48-02/48-04): wire `source` carries the basename-only value, `os` lowercase on the wire, `buildID` camelCase; synthetic rows carry `synthetic: true` and are excluded from maintainer queries; the gate derives the admitted set from `telemetry-enrichment.ts` | Keep reporter's `source` (basename-only by construction [VERIFIED: telemetry-error-report.ts:59-63]) on the wire and document it as the basename; `os` lowercase on the wire, `OS` in prose; synthetic rows carry `synthetic: true` and are excluded from maintainer queries. Gate derives the admitted set from `telemetry-enrichment.ts`. |
| Q5 | D1 table/DDL exact shape + download-count aggregation (latest-per-asset vs daily rows)? | RESOLVED (2026-10-23, plan 48-02): `events` one row per admitted event with server `received_at`; `download_counts` upsert per (asset, day) idempotent on retry; 30-day delete covers both tables; the gate drives the handler against a stub D1 | `events` one row per admitted event with server `received_at`; `download_counts` upsert per (asset, day); 30-day delete covers both. Gate drives the handler against a stub D1. |
| Q6 | Rate-limit threshold/period values? | OPEN (operator tuning) | Recommended: start per S8 shape (per-IP budget/minute, block), record verbatim, tune from Worker analytics after first release. |
| Q7 | Does `powerbrowser-updates` need `functions/`/`_worker.js` absence re-asserted for the watchdog file? | OPEN (Phase 47 owns `updates-repo-static` row) | Recommended: watchdog workflow file lives in `.github/workflows/` only; plans assert no `functions/`/`_worker.js` is added alongside it. |

## Environment Availability

| Resource | Available this session | Notes |
|----------|------------------------|-------|
| Product tree (`theia/extensions/telemetry`, `scripts/`, `powerbrowser/`, `configuration.toml`, workflows) | YES — read | All VERIFIED claims above; `upstream/` untouched |
| `node` v24.9.0, `nix` 2.34.9 | YES | Gates run offline; `yarn`/builds need the theia shell (plan time) |
| Built sidecar / binary / BiDi harness | NO | Live-delivery drill is full-tier at plan time (needs build + display-capable host) |
| Cloudflare account, zone, D1, Worker deploy, rate-limit rule, DNS | NO | Owner actions at `checkpoint:human-action` (A48-4) |
| GitHub Apps, `bot`/`release`/`descriptor` envs, pinned-issue creation, watchdog apply, live `gh api` writes | NO | Owner actions; read-only `gh api` allowed for research/read-back rows |
| Network (docs re-verify, product-details, nodejs.org, wrangler version) | NO | Web search unavailable (no API key); re-verify Q2/Q6 + stack pins at plan time |
| `docs/PRIVACY.md`, `docs/RENEWALS.md`, `worker/`, `release-train.yml`, `scripts/release-train.mjs` | ABSENT | Owned by Phases 42/43/47 or created here; plans create/hand-off as mapped |

## Validation Architecture

Test framework: `scripts/verify-platform.sh` registry rows only (CLAUDE.md one-driver rule). `--quick` = no build/browser/display/network; everything else is full-tier. Every row derives from the tree and compares as set equality, with a `--self-test` that plants each fault (control green first, each plant red naming the drift).

| Req | Row(s) | Tier | What the row asserts (derived, set-equality) | Self-test plants |
|-----|--------|------|-----------------------------------------------|------------------|
| TEL-06 | `telemetry` (extended `verify-telemetry.mjs`) | quick | Fragment == manifest emission; tracked block == fragment; enrichment key set ⊆ admitted set; preference description == exact TEL-06 bytes; `toolkit.telemetry.server` blank at off; sender compiles + unit suite green | Always-send stub (off-test red); drifted block/fragment; extra enrichment key; `stack` field; direct-fetch hook; level bypass; one-word description change — each red naming the drift |
| TEL-06 | `tel06-error-delivery-live` + `tel06-error-delivery-live-self-test` (new `verify-telemetry-live-delivery.mjs`, corrected payload) | full + quick (analyzer) | Full: one loopback POST from running sidecar with `{type, basename, line, column, version, buildID, OS}`, no message/stack/path/URL; zero requests at off in same run; source + bundle restored (marker grep) | Analyzer: missing POST, stack plant, unadmitted-key plant, full-path plant, empty capture |
| TEL-10 | `events-worker` + `events-worker-self-test` (new `verify-events-worker.mjs`) | quick | Handler importable under plain node; accepted POST writes exactly one D1 row per admitted event (server time, no client id, no unadmitted prop); caps/retention == privacy-doc numbers (both derived) | Wrong method/path/content-type, unparseable body, non-object top level, over-cap batch/body, extra-prop event, over-length string, over-rate sequence — each red naming the rule; no-credential shape test |
| TEL-11 | same `events-worker` gate (authed-route half) + sweep self-test | quick | Unauthenticated POST → 401; authed valid POST → D1 upsert; sweep holds no Cloudflare token (static scan of sweep job for token-shaped refs) | Missing/wrong secret → 401; malformed body → 400; row-shape assertion |
| TRAIN-07 | `release-train-maintenance-self-test` (extend `release-train.mjs --self-test`) + sweep rows in `maintenance` job | quick (logic) + full (live render) | Logic: `derive/next/render` over fixture API JSON incl. all six rows + no-data branches; live: pinned issue body == render, PATCH only on diff, comment only on red transition | One red-row plant → exactly one comment; staying-red re-run → zero new comments; duplicate/no-data/live-branch fixtures; fork-head/draft-Release-shaped plants where applicable |
| MON-01 | watchdog file self-test (in-memory run-table fixture) + live 26-h drill | quick (fixture) + owner drill | Fixture: last-run 25 h → no issue; 27 h → one issue in own repo with run link; product repo gains no `schedule:` (`workflows` row stays green) | fresh/stale/missing-run plants; unguarded `workflow_run`; event-text in `run:` |
| Cross-cut | `workflows` / `workflows-self-test`, `zizmor`, `theia-endpoints`, `allowlist` schema, `scan-brand-residue` | quick | New workflow edits keep D-77/SHA/guard/no-event-text; events host present + marked; residue 0 (staged tree) | Existing plants + new-file coverage |

**Wave 0 gaps (must close before plans land):** (1) enrichment module absent — producer delta is the critical path; (2) `worker/` absent — Worker + gate are greenfield; (3) `release-train.mjs`/`release-train.yml` absent (Phase 43) — sweep extends files that do not exist yet, so Phase 48 plans pin the assumed function/job names and re-verify at plan time; (4) `docs/RENEWALS.md`/`docs/PRIVACY.md` absent — RENEWALS rows and privacy strings are hand-offs; (5) no live Cloudflare/GitHub — all live rows are owner-run after the `checkpoint:human-action`.

## Security Domain

ASVS mapping (applicable categories only): **V1 Architecture** (clock-only Worker, reconciler, tokenless sweep, watchdog outside product repo); **V5 Validation** (validate-before-write, allowlist-typed fields, truncations, 400/413/200-discard); **V7 Errors/Logging** (no message/stack/path/URL, sanitised constructor names, server-time rows, synthetic-row segregation); **V9 Communications** (TLS-only https endpoint, allowlisted egress, no credential in shipped bundle); **V14 Configuration** (secrets only in `bot` env + Worker secret with RENEWALS rows, no Cloudflare token in sweep, SHA-pinned workflows, no `schedule:` in product repo).

| Threat ID | Category | Component | Severity | Disposition | Mitigation |
|-----------|----------|-----------|----------|-------------|------------|
| T-48-01 | Information disclosure | Error payload (paths/URLs/stacks/messages) | High | Mitigate | Admitted set `{type, basename, line, column, version, buildID, OS}` enforced at producer (IDENTIFIER/FILE_NAME guards [VERIFIED]) + server-side drop of extras + wire drill asserting no stack/path/URL + self-test tripwire |
| T-48-02 | Information disclosure | Telemetry live by default | High | Mitigate | Shipped level off; per-event live level read drops before queueing; level-off blank Gecko server; drill negative half proves zero requests at off in the same run |
| T-48-03 | Information disclosure | Diagnostics/issue prefill confusion | Low | Accept-with-control | Out of scope here (TEL-05/Phase 53); this phase sends no diagnostics and builds no prefill URL |
| T-48-04 | Denial of service | Public `/events` flood | High | Mitigate | Content-Length/body caps pre-read, batch cap, per-string truncation, over-rate 200-discard (no retry storm) + one Cloudflare rate-limiting rule recorded verbatim |
| T-48-05 | Spoofing | Forged/replayed events | Low | Accept | Public client holds no credential by design; rows carry server time only; no authority flows from an event; synthetic rows segregated |
| T-48-06 | Tampering | Client-widened stored set | Medium | Mitigate | Server enforces admitted set; gate plants extra-prop event → row must not contain it |
| T-48-07 | Elevation of privilege | Privileged buildID/version read | Medium | Mitigate | Bake into fragment at generate/build time (no new privileged importer) or one `PowerBrowserAPI.sys.mjs` accessor + catalogue row; boundary + catalogue checks run in verify |
| T-48-08 | Tampering | Untracked egress host | Medium | Mitigate | Events host added with `manifest: telemetry.endpoint` in same commit; endpoints gate fails missing/stale naming host/entry |
| T-48-09 | Repudiation | Synthetic probe mixed into maintainer queries | Medium | Mitigate | Synthetic row deleted/marked + filtered in every D1 query; gate plants synthetic event → excluded |
| T-48-10 | Information disclosure | Secret in sweep logs / Worker code | High | Mitigate | Secret compared constant-time, never logged/stored; shape-test over `worker/` for credential assignments; sweep scans clean of Cloudflare tokens |
| T-48-11 | Elevation of privilege | Prompt injection reaching write tokens (sweep/report jobs) | High | Mitigate | Three-job discipline inherited (report sole writer, `issues: write` confined [VERIFIED]); no event text in `run:`/`prompt:`; no App token in derive/detect jobs; inputs validated (tag regex, key ordering) |
| T-48-12 | Elevation of privilege | Same-repo branch reaching legion / env secrets | High | Mitigate | Sweep/report on `ubuntu-latest` only; legion label confined to `release.yml build-*/matrix-*` (existing `legion` rule); env branch policies `main`-only (Phase 41, read back by `repo-controls`) |
| T-48-13 | Tampering | App without Workflows pushing workflow files (watchdog/sweep edits) | Medium | Mitigate | Bot App has no Workflows permission (GH-10); watchdog file applied by owner; `workflows` row + server policy reject workflow writes from App tokens |
| T-48-14 | Denial of service | Watchdog disabled by 60-day rule | Medium | Mitigate-with-probe | Keep watchdog repo active by design; record Q1 probe; sweep's watchdog-age row gives a second signal inside the product repo |
| T-48-15 | Information disclosure | Privacy-page/Worker/issue payload drift | Low | Mitigate | Single canonical strings handed to Phase 47; gate derives caps/retention from both code and privacy source; stale either side → red |

## Sources

In-tree (HIGH — read this session, verbatim quotes in Code Examples):
- `theia/extensions/telemetry/src/browser/telemetry-sender.ts` (envelope, level gating, `error.message` naming to be corrected)
- `theia/extensions/telemetry/src/browser/telemetry-error-report.ts` (admitted shape, sanitiser guards, fixed event names)
- `theia/extensions/telemetry/src/browser/telemetry-error-capture.ts` (wiring only)
- `theia/extensions/telemetry/src/browser/telemetry-preferences.ts` (description to be replaced verbatim)
- `theia/extensions/telemetry/src/browser/telemetry-frontend-module.ts` (fail-closed fragment read)
- `theia/extensions/telemetry/src/browser/telemetry-logger.ts` (thin translation)
- `theia/extensions/telemetry/test/telemetry-sender.test.mjs` (suite + always-send discrimination idiom)
- `scripts/verify-telemetry.mjs` (pin + build checks + NG-067 error-report case)
- `scripts/generate.mjs` (`emitTheiaTelemetry`, `mozillaEndpointPrefs`, `manifestEndpointSources`, `releaseIdentity`)
- `scripts/lib/endpoint-verdict.mjs` (DISPOSITIONS + verdict rule)
- `scripts/verify-theia-endpoints.mjs` (coverage + stale-mark + pref-agreement checks)
- `scripts/verify-workflows.mjs` (trust-boundary rules + self-test fixtures)
- `scripts/verify-platform.sh` CHECKS registry (row + self-test convention, quick/full tiers)
- `scripts/crash-collector.mjs` + `scripts/verify-crash-collector.mjs` (Worker/gate template)
- `configuration.toml`, `generated/theia-telemetry.json`, `theia/applications/browser/package.json`, `powerbrowser/endpoint-allowlist.json`
- `.github/workflows/verify.yml`, `.github/workflows/notify-drill.yml`, `.github/settings/*`
- `.planning/workstreams/deploy/REQUIREMENTS.md` (TEL-06/10/11, TRAIN-07, MON-01, Owner Decisions 1–22, External Gates, Out of Scope)
- `.planning/workstreams/deploy/ROADMAP.md` (Phase 48 goal + success criteria + hard constraints)
- `.planning/workstreams/deploy/STATE.md`, `.planning/workstreams/deploy/phases/48-*/48-CONTEXT.md`
- `.planning/research/v1.6-deploy/ARCHITECTURE.md` §§1/4, `SUMMARY.md`, `STACK.md`, `PITFALLS.md`, `CRITIQUE.md`, `FEATURES.md`
- `.planning/drafts/distribution/S8-reports-bug-error-crash-PLAN.md` (events Worker shape, drill idiom — `message` field noted as contradicted by TEL-06)
- `docs/RELEASING.md`, `docs/CRASH-POLICY.md` (collector contract, drill references)
- `CLAUDE.md` (hard rules)

External (MEDIUM/LOW — no live fetch this session; re-verify at plan time):
- [Cloudflare Workers limits](https://developers.cloudflare.com/workers/platform/limits/) [CITED]
- [Cloudflare D1 limits](https://developers.cloudflare.com/d1/platform/limits/) [CITED]
- [Cloudflare rate-limiting rules](https://developers.cloudflare.com/waf/rate-limiting-rules/) [CITED]
- [GitHub events that trigger workflows (60-day rule, workflow_run caps)](https://docs.github.com/en/actions/reference/workflows-and-events-that-trigger-workflows) [CITED]
- [GitHub self-hosted runners REST](https://docs.github.com/en/rest/actions/self-hosted-runners) [CITED]
- [GitHub deployments and environments](https://docs.github.com/en/actions/reference/workflows-and-actions/deployments-and-environments) [CITED]

## Metadata

- **Phase:** 48 — Error telemetry, maintenance sweep and watchdog (D)
- **Workstream:** `deploy` (`workspace/deploy`)
- **Requirements:** TEL-06, TEL-10, TEL-11, TRAIN-07, MON-01
- **Depends on:** Phase 43 (train skeleton), Phase 47 (zone + events hostname + TEL-08), Phases 49/50 (live values), Phase 41 (Apps/checkpoint), Phase 46 (update egress boundary)
- **Confidence:** HIGH (in-tree) / MEDIUM (design) / LOW (platform versions — re-verify at plan time)
- **Output:** `.planning/workstreams/deploy/phases/48-error-telemetry-maintenance-sweep-and-watchdog-d/48-RESEARCH.md`
- **Commit:** Do NOT commit (orchestrator commits). Do NOT create PLAN files.
