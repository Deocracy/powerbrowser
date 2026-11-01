# API Coverage — Phase 45: Portable Linux release build (C)

> No external API integration: the phase touches only the Gecko/Mozilla build
> system, the container toolchain, and tree-local gates — the Safe Browsing
> keyfile is a one-line mozconfig build flag via the upstream `simple_keyfile`
> precedent, mounted read-only and never COPYed.

## Detector run

The orchestrator's pre-run of `api-coverage` over the phase scope returned
`detected:true`, and an independent re-run in this planning session over the
four PLAN bodies plus the ROADMAP Phase 45 text confirmed it:

```sh
printf '%s' "$SCOPE" | node gsd-core/bin/lib/api-coverage.cjs --json
# {"detected":true,"signals":[{"verb":"(surface)","noun":"api",
#   "snippet":"Owner actions per CONTEXT owner gates and REQUIREMENTS
#   External Gates (Google Safe Browsing API key; keyfile on legion):"}]}
```

The single signal is the prose phrase "Google Safe Browsing API key" in the
owner-gate description. It is a **false positive**: no external API or SDK is
integrated by any plan in this phase. What the phase touches instead:

- **Safe Browsing keyfile (UPD-29, plan 45-04):** a one-line mozconfig build
  flag, `ac_add_options
  --with-google-safebrowsing-api-keyfile=/keys/sb-gapi.data`, emitted by the
  generator in the release variant only, via the upstream
  `simple_keyfile("Google Safebrowsing API")` mechanism
  (`upstream/toolkit/moz.configure:1149-1154`, `keyfiles.configure:7-32`).
  The file is read once at configure time and baked as
  `MOZ_GOOGLE_SAFEBROWSING_API_KEY`; the keyfile lives outside the repo on
  legion, is bind-mounted `podman -v <keydir>:/keys:ro`, and is never
  committed, COPYed, or logged. The live list-update check observes the
  browser's normal classifier downloads; no Google API client, SDK, or REST
  call is authored by this phase.
- **Container toolchain (PKG-17, plan 45-01):** the Debian archive plus
  Mozilla's `--enable-bootstrap` toolchain fetches — the same sources Mozilla
  ships Firefox with. No package-manager install of an SDK.
- **Gates and staging (plans 45-02/45-03):** tree-local `node` row scripts
  spawning host `readelf`/`file`/`find`/`patchelf`; no network, no service.

## Decision

No capability matrix is produced because there is no integrated API surface
to cover. If a future phase integrates an external API (e.g. Phase 47
hosting, Phase 48 telemetry Worker), that phase produces its own COVERAGE.md
matrix; this declaration does not cover it.
