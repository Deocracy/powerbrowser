# Phase 53 Plan 03: Codeberg mirror timer and Upptime target set - Summary

**The legion mirror timer and its lag-detection row, and the Upptime target declaration with its set-equality row and sweep-report contract, are built and gated locally. No owner write, token, repository, DNS change or nrs apply was made.**

## Performance

- **Tasks:** 2 of 2 complete
- **Commits:** `fde6eb0` (Task 1: Codeberg timer, service, row and live row), `449c77e` (Task 2: Upptime targets, row and live row)
- **Gate:** `scripts/verify-platform.sh --quick` exit 0 after both tasks ("verify-platform: PASS -- all checks passed")

## What was built

- **`systemd/codeberg-mirror.timer`** (`fde6eb0`): `OnCalendar=daily`, `Persistent=true`, `RandomizedDelaySec=15m`, `WantedBy=timers.target`.
- **`systemd/codeberg-mirror.service`** (`fde6eb0`): `Type=oneshot`. `ExecStartPre` fetches `origin` heads and tags. `ExecStart` pushes the `codeberg` remote with the `refs/heads/*` and `refs/tags/*` refspecs and never `--mirror`. The unit names no credential, token value, token path, `EnvironmentFile` or `LoadCredential`.
- **`scripts/verify-codeberg-mirror.mjs`** (`fde6eb0`): quick mode checks the timer and service keys, scans the unit files' non-comment lines and the tracked workflow, settings and unit files for token material, and proves the SHA compare on in-memory pairs. `--live --slug=owner/repo` compares the unauthenticated Codeberg `main` SHA with the GitHub `main` SHA and fails closed on an undeclared slug.
- **`.github/upptime-targets.json`** (`449c77e`): the declared targets `updates` (source `urls.update`) and `website` (source `urls.homepage`), with `derivation_source: configuration.toml`.
- **`scripts/verify-upptime.mjs`** (`449c77e`): quick mode derives the expected target set from `configuration.toml` and compares it by set equality, checks each declared target's source pointer, rejects any schedule key in `.github/workflows/` (D-77), and proves the sweep-report contract on fixtures (enabled state and last-run age within 36 hours). `--live --slug=owner/repo` reads the status repository's workflows and last runs through `gh api`, and fails closed on an undeclared slug.
- **Registry rows** (`fde6eb0`, `449c77e`): quick rows `codeberg-mirror`, `codeberg-mirror-self-test`, `upptime-config`, `upptime-config-self-test`; full-tier rows `codeberg-mirror-live` and `upptime-sweep-live`, which no quick path calls.

## Verification results

- `node scripts/verify-codeberg-mirror.mjs`: PASS. `--self-test`: baseline green, then the lagged SHA pair red naming the mirror, token literal and token path in the service red naming the unit, a weekly timer, a dropped Persistent and a `--mirror` flag each red naming the drift, and the matching pair green.
- `node scripts/verify-upptime.mjs`: PASS. The derived set is `updates, website`, and the named deferral for `events` is printed. `--self-test`: baseline green, then a dropped website target red naming `'website'`, an added search target red naming `'search'`, an events endpoint the declaration omits red naming `'events'`, a disabled workflow red naming it, a stale last-run age red naming `hours ago`, and a schedule key red naming the workflow file. A fresh active sweep stays green.
- `--live` for both verifiers with no slug declared: FAIL, naming the owner step. Expected until the owner declares the repositories.
- `scripts/scan-brand-residue.mjs`: PASS over 456 scanned files.
- `--only` for `codeberg-mirror`, `codeberg-mirror-self-test`, `upptime-config`, `upptime-config-self-test`: each exit 0.

## Deviations from Plan

### Gaps against the plan (recorded, not hidden)

- **The `/events` target is deferred.** The plan asked for `updates`, `website` and `/events`, with `/events` derived from the telemetry host. `configuration.toml` has `[telemetry] level = "off"` and no `endpoint`, so there is nothing to derive. The row prints the deferral and does not guess a host. BLOCKED.md item 4 lists the owner step; the target joins when the manifest declares the endpoint.
- **The live rows are defined, not applied.** `codeberg-mirror-live` and `upptime-sweep-live` are red until the owner creates the mirror, the status repository and the CNAME (BLOCKED.md items 2 and 3). They fail closed.
- **`COVERAGE.md` was left as seeded.** It declares "No external API integration". The full-tier live rows make one unauthenticated read and one read-only `gh api` call each; they are verifiers, not product integrations. The file's wording predates those rows and was not changed.
- **The Codeberg token RENEWALS row is deferred** to the owner checkpoint, as the plan says: 53-03 does not write RENEWALS. BLOCKED.md item 2 carries the step.
- **The mirror's `origin` and credential helper live on legion,** outside the repository. The unit depends on that configuration, which the owner applies (BLOCKED.md item 2).

### Auto-fixed Issues

**1. [Rule 1 - Bug] The Persistent plant mutated a comment**
- **Found during:** the first Codeberg self-test run. `Persistent=true` also appears in the timer's header comment, so the plant changed the comment and the setting stayed true.
- **Fix:** the plant is anchored on the setting line (`\nPersistent=true\n`). The self-test caught it, which is the point of the plant.

## Known Stubs

None. The events target and the live rows are deferrals, recorded above and in BLOCKED.md, not stubs in code.

## Threat Flags

None beyond the plan's threat model. The timer and service carry no credential; the Upptime declaration names only manifest-derived surfaces.

## Self-Check: PASSED

- The timer, service, verifiers and the Upptime declaration exist in the tree.
- Commits `fde6eb0` and `449c77e` are on `dsh/phase-53`.
- The quick gate passed after both commits.
- No owner write, token, repository, DNS change or nrs apply was made.
