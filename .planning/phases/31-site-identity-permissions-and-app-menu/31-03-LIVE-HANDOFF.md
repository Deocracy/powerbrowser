# 31-03 Live Handoff — site-data clear, tracking shield

Built from the tree after commit `bb48f47` (the Theia app build ran after the
last Theia source change of this plan, `yarn build` exit 0):

```sh
nix develop .#theia --command bash -c 'cd theia && yarn build' > "${TMPDIR:-/tmp}/pb-31-03-build.log" 2>&1
```

The live gate runs with the startup cache purged by the harness itself
(`MOZ_PURGE_CACHES=1`, set in `withProbeShell`). The browser is the
`objdir/dist/bin/powerbrowser` the 31-01 and 31-02 runs used.

## Scenario names

`clear-data` and `shield` are new in this plan. `identity-tls`,
`identity-local` and `site-panel` are the 31-01 and 31-02 scenarios, run again
as regression. Each session opens at most four web tabs and runs in its own
probe profile. The TLS session uses a fixed port, so live runs are sequential.

## Commands and PASS definitions

### 1. Clear site data (31-03 task 1)

```sh
node scripts/verify-site-identity-live.mjs --scenario clear-data
```

- PASS: `clear-data: PASS`; no `FAIL --`, no `NOT SCORED`, no `harness:` line.
- What it proves, in order:
  - the 127.0.0.1 page sets a marker cookie, and before the clear the
    positive controls hold: the token cookie (`POWERBROWSER_TOKEN`, read from the
    boundary's literal at check time) and the marker are both in the jar;
  - the panel's clear-data row opens a Theia ConfirmDialog; its Clear button
    sends `webTabClearSiteData` for the origin the panel displayed;
  - after the clear the marker is gone, the token is still in the jar, and a
    same-origin request from the Theia frame still returns 200 (the IDE is still
    signed in);
  - the same on a localhost tab: the marker is present before, gone after; the
    chrome-side `SiteDataManager.hasSiteData('localhost')` reads `false` after
    the clear and `true` before it.
- Plant `clear-signout` (`--self-test`): the token cookie is removed just before
  the clear, the fault a clear without the exemption would cause. Must go red
  naming `signed out`.

### 2. Tracking shield (31-03 task 2)

```sh
node scripts/verify-site-identity-live.mjs --scenario shield
```

- PASS: `shield: PASS`.
- The tracker page (127.0.0.1) loads an image from `trackertest.org`, which the
  bundled classifier blocks (`blockedTrackers` pushed as 1 on this fixture); the
  session runs with `privacy.trackingprotection.enabled` on. A positive control
  requires the count of at least 1 before any toggle; a count of 0 is reported
  as `BROKEN` (fixture not blocked), never a pass.
- What it proves, in order:
  - the count line reads `1 tracker blocked` (or the plural), and the toggle
    reads `Turn off protection for this site`;
  - the toggle sends `webTabShieldToggle`; the applied change closes the panel
    (the tab reloads, as upstream's popup does); the box shield appears;
  - chrome holds the exception for the tracker page (`ContentBlockingAllowList`
    on that overlay) and does not hold it for the second site (localhost);
  - reopened, the count line reads `Tracking protection is off for this site`,
    and the toggle reads `Turn protection back on`;
  - toggled on: the exception goes, the box shield goes, the page counts its
    tracker again (`N trackers blocked`), and the second site stays unexcepted.
- Plant `shield-stale` (`--self-test`): the box shield is never rendered, so the
  change cannot reach the identity box. Must go red naming
  `shield icon did not update`.
- Plant `shield-leak` (`--self-test`): the exception is also written on the
  second site after the toggle. Must go red naming `wrong site`.

### 3. Regression: 31-01 and 31-02 scenarios

```sh
node scripts/verify-site-identity-live.mjs --scenario identity-tls,identity-local
node scripts/verify-site-identity-live.mjs --scenario site-panel
```

- PASS: `identity-tls: PASS`, `identity-local: PASS`, `site-panel: PASS`.

### 4. Live self-test (every plant red)

```sh
node scripts/verify-site-identity-live.mjs --self-test
```

- PASS: `--self-test: PASS` with a green clean control for each of the five
  sessions (`identity-local`, `identity-tls`, `site-panel`, `clear-data`,
  `shield`) and every planted fault red on its target: `typed-lock`,
  `perm-refused`, `icons-stale`, `clear-signout`, `shield-stale`, `shield-leak`.

### 5. Static gates (no browser)

```sh
node scripts/verify-site-identity.mjs
node scripts/verify-site-identity.mjs --self-test
node scripts/verify-web-tab-bridge.mjs
node scripts/verify-web-tab-bridge.mjs --self-test
node scripts/verify-shell-error-copy.mjs
node scripts/verify-ng-040-internals-catalogue-lines.mjs
bash scripts/check-internals-boundary.sh --catalogue
scripts/verify-platform.sh --quick
node scripts/scan-brand-residue.mjs
```

## Last run (final build, after commit `9c097a6`)

- `clear-data: PASS`, `shield: PASS`, `identity-tls: PASS`, `identity-local: PASS`, `site-panel: PASS`.
- `--self-test: PASS -- the clean control is green and all 6 planted faults went red: typed-lock, perm-refused, icons-stale, clear-signout, shield-stale, shield-leak` (exit 0).

## Files this handoff covers

- `scripts/verify-site-identity-live.mjs`: `clear-data` and `shield` scenarios,
  `/seed` and `/tracker` pages, the `clear-signout`, `shield-stale` and
  `shield-leak` plants, the per-scenario pref map (`SCENARIO_PREFS`).
- `scripts/verify-site-identity.mjs`: cases 15 and 16 and six new plants.
- `scripts/verify-web-tab-bridge.mjs`: the two new kinds classified `privileged`.
- `scripts/verify-shell-error-copy.mjs`: the pinned clear-data and shield copy.
