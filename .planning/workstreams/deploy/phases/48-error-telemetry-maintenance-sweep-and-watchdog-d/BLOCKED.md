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
  2. Set the repository variable `OWNER_LOGIN` to the owner's login. The pinned-issue selection and the comment mention
     both read it; an unset variable selects nothing.

## 2. Bot App permissions for the probe (owner)

- **Skipped:** the runner count and the watchdog-run read in `maintenance-probe`.
- **Why:** the probe mints an App token with `permission-administration: read` and `permission-actions: read`, scoped to
  `powerbrowser` and `powerbrowser-updates`. The App's granted permissions are an owner setting.
- **Owner steps:** in the bot App settings, grant Administration (read) and Actions (read), and make sure the App is
  installed on `powerbrowser-updates`. The `bot` environment already holds `BOT_APP_ID` and `BOT_APP_PRIVATE_KEY`.

## 3. Watchdog source has not been applied (owner)

- **Skipped:** the watchdog workflow in `powerbrowser-updates`.
- **Why:** `DeBIOS-Foundation/powerbrowser-updates` is an empty repository (the API answers `Git Repository is empty`,
  HTTP 409). The source `docs/watchdog.yml` is built and gated, but it is not in that repository.
- **Owner steps:** initialise `powerbrowser-updates` with a first commit, then add `.github/workflows/watchdog.yml` with
  the contents of `docs/watchdog.yml` (copy it byte for byte; the header states it is never applied to the product
  repository). Dispatch it once, then confirm it opens no issue against a fresh run. This is the 26-hour drill, which the
  owner runs at plan 48-05.

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
  rows. The synthetic probe fails closed (status not 2xx, a red row) when the value is wrong.
