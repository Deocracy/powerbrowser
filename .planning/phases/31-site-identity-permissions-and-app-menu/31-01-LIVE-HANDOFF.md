# 31-01 Live Handoff — site identity tracer (Tasks 1–3)

Static work is committed; the commands below need the built browser and
the last Theia app build, which this sandbox cannot run (no `yarn`,
no Theia build, no live checks per the plan's sandbox limits).

## Task 1 — identity-lock live scenario

```sh
nix develop .#theia --command bash -c 'cd theia && yarn build' > "${TMPDIR:-/tmp}/pb-31-01-t1-build.log" 2>&1
node scripts/verify-site-identity-live.mjs --scenario identity-lock
node scripts/verify-site-identity-live.mjs --self-test
```

- PASS definition: `identity-lock: PASS` with no `FAIL --`, `NOT SCORED`,
  `harness:` or `error TS` line; `--self-test` ends `--self-test: PASS`
  naming `typed-lock` among the red plants.
- What it proves: a served-origin tab renders `.pb-identity` with the
  pushed host; typing `https://evil.example` leaves the box unchanged;
  an untitled editor shows no `.pb-identity`; the `typed-lock` plant
  (which overrides `AddressBar.lockFromTypedText` to read pill text)
  goes red naming `lock derived from typed text`.

## Task 2 — bridge gate (static; already green here, re-run after build)

```sh
node scripts/verify-web-tab-bridge.mjs
node scripts/verify-web-tab-bridge.mjs --self-test
```

- PASS definition: `verify-web-tab-bridge: PASS -- 13 webTab kinds …`
  and `--self-test: PASS -- 21 planted faults all went red`.

## Task 3 — static gate plus registry rows (already green here)

```sh
node scripts/verify-site-identity.mjs
node scripts/verify-site-identity.mjs --self-test
scripts/verify-platform.sh --quick
scripts/verify-platform.sh --only site-identity
```

- PASS definition: `verify-site-identity: PASS -- 10 cases`; self-test
  names all 7 planted faults; `--quick` green except the pre-existing
  environment rows listed in the summary (`verify-downstream-fixtures*`,
  `installer-build-proof-self-test`, `sql-store-soak*`, plus the
  pre-existing `gui07-strip-spike-verdict*` red also seen on the clean
  tree).
