# Phase 48 BLOCKED items (plans 48-03 and 48-04)

Everything below needs the owner. Each item names the skipped piece and the exact owner steps. Nothing here was written
live; the plans built and gated every piece locally.

## 1. Pinned maintenance issue (plan 48-05, owner)

- **Skipped:** the live pin of `release-train: maintenance`, and every live sweep write (PATCH, comment).
- **Why:** the report job never creates the pinned issue; it writes only an existing owner-authored issue carrying the
  `release-train` label. Until the owner pins it, every run prints the would-create line and writes nothing.
- **Owner steps:**
  1. Create the issue with the exact title `release-train: maintenance`, labelled `release-train`, authored from the
     owner account, after item 3 (the watchdog) is applied.
  2. Set the repository variable `OWNER_LOGIN` to the owner's login. The pinned-issue search (server-side, by author
     and the `release-train` label), the selection and the comment mention all read it; an unset or malformed
     variable searches and selects nothing. Logins compare case-insensitively.
  3. The sweep runs once per UTC day (the first dispatch tick at or past 06:00 UTC with no accepted sweep of today,
     read from the maintenance-state artifact), so the `bot` environment approval is asked at most once a day.

## 2. Bot App permissions for the probe (owner)

- **Skipped:** the watchdog-run read in `maintenance-probe`. The runner count is deferred to Phase 49 (WR-11): the
  Administration read it needs is not requested now, because the runner-online row renders no-data until a runner is
  registered anyway.
- **Why:** the probe mints one App token with `permission-actions: read`, scoped to the single repository
  `powerbrowser-updates`. The App's granted permissions are an owner setting. A missing grant fails the mint and the
  read; the watchdog-age row then renders red and the rest of the sweep still runs.
- **Owner steps:** in the bot App settings, grant Actions (read) and make sure the App is installed on
  `powerbrowser-updates`. The `bot` environment already holds `BOT_APP_ID` and `BOT_APP_PRIVATE_KEY`. Phase 49 adds the
  Administration (read) grant on `powerbrowser` with the runner-count step.

## 3. Watchdog source has not been applied (owner)

- **Skipped:** the watchdog workflow in `powerbrowser-updates`.
- **Why:** `DeBIOS-Foundation/powerbrowser-updates` is an empty repository (the API answers `Git Repository is empty`,
  HTTP 409). The source `docs/watchdog.yml` is built and gated, but it is not in that repository.
- **Owner steps:** initialise `powerbrowser-updates` with a first commit, then add `.github/workflows/watchdog.yml` with
  the contents of `docs/watchdog.yml` (copy it byte for byte; the header states it is never applied to the product
  repository). Dispatch it once, then confirm it opens no issue against a fresh run. This is the 26-hour drill, which the
  owner runs at plan 48-05.
- **Dedupe (BL-01).** The watchdog counts only its own open issues: authored by the Actions bot and carrying the label
  `release-train-watchdog` (the workflow creates the label with `gh label create --force`, so no owner step). A
  same-title issue by anyone else does not suppress the alert. The repository variable `WATCHDOG_AUTHOR` overrides the
  default author `app/github-actions`; if the author login that `gh` reports differs, set the variable. An empty value
  skips the dedupe (one alert a day), never silences the watchdog. The job holds `issues: write` only (no checkout).
- **Sweep row (WR-10).** The sweep's watchdog-age row reads the newest successful run of event `schedule`. A manual
  dispatch and a failed run do not count, so the row stays red until the first scheduled tick (06:17 UTC) after the
  apply, and goes red again if the watchdog fails every day.

## 4. The release train is not on the default branch of the product repository (owner)

- **Skipped:** the live watchdog read and the live sweep's previous-state lookup against real runs.
- **Why:** `gh api repos/DeBIOS-Foundation/powerbrowser/actions/workflows/release-train.yml` answers 404 on the default
  branch, so `.github/workflows/release-train.yml` is not on `main`. The Phase 43 and Phase 48 train work lives on the
  workstream branches until the owner merges it.
- **Owner steps:** merge the train work to `main` through the normal review, then dispatch `release-train.yml` once with
  reason `owner` so the first run exists.

## 5. Full-tier drill (plan 48-05, owner)

- **Skipped:** the live loopback delivery drill (`tel06-error-delivery-live`) and its restore-plus-grep proof.
- **Why:** the drill needs the nix theia shell, a frontend rebuild and the built binary (`objdir/dist/bin/powerbrowser`),
  none of which run in this session.
- **Owner steps:** from the phase clone, run `node scripts/verify-telemetry-live-delivery.mjs` inside the repo's nix
  environment. Expect one POST carrying both events after the preflight, zero requests at level off in the same run,
  `theia/applications/browser/package.json` byte-identical afterwards, and zero marker hits in the rebuilt bundle.

## 6. Synthetic probe secret (owner confirmation)

- **Confirm:** the bot environment secret `DOWNLOAD_COUNT_SECRET` equals the Worker secret. `docs/RENEWALS.md` carries the
  rows.
- **What the probe detects (WR-02).** A wrong, rotated-out or empty secret does not make the Worker refuse the probe: it
  stores the event as a real row and answers 200. The Worker therefore answers `ok: stored 1 synthetic 1` only when the
  secret was accepted and the event honoured as synthetic, and the probe is green only on exactly that body. A plain
  `ok: stored 1`, a non-2xx status, an empty secret, a non-https endpoint or a timeout (20 s) is a red
  `synthetic events POST` row. Until the Worker with the acknowledgement is deployed (plan 48-05), the row is red by
  design. A red probe can leave one non-synthetic `MaintenanceProbe` row in the maintainer view per sweep; it is removed
  by the 30-day retention.
