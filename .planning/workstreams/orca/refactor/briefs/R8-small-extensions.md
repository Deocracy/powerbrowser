# Refactor brief: R8-small-extensions

Owned:

- every tracked file under `theia/extensions/telemetry/`, `theia/extensions/branding/`,
  `theia/extensions/token-gate/`, `theia/extensions/bundled-extensions/` and
  `theia/extensions/customize/`;
- `worker/events-worker.mjs` and `worker/crash-submit.mjs`;
- every tracked file under `bundled-extensions/` at the repository root.

Not owned: `worker/schema.sql`, `worker/wrangler*.toml`, `worker/crash-r2-lifecycle.json`,
`theia/applications/`.

Notes:

- `token-gate` authenticates every request to the sidecar backend. Do not change what is checked,
  the order of the checks, or the comparison used. A constant-time comparison stays constant-time.
- `telemetry` and the two workers are a privacy contract: what is collected, when, and what is
  refused are recorded decisions. Do not change a field, an endpoint, a limit or a refusal.
  `scripts/verify-worker-submit.mjs` is a ledger-locked test over `worker/crash-submit.mjs`; run it,
  and treat any change it would reject as Blocked by check.
- `branding` values are hand-written literals that the generator must reproduce byte for byte
  (`node scripts/generate.mjs` and the byte-identity checks). Do not derive, template or reformat
  a branding value. If a file is listed as generator output, do not edit it at all.
- The workers run on a hosted edge runtime: no Node built-ins. Look for request bodies read
  without a size bound, awaits in sequence that are independent, and error paths that leak a
  raw exception message to the response.
