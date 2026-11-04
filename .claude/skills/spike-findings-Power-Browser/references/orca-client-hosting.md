# Hosting Orca's web client in PowerBrowser

PB spawns a headless orcad and shows Orca's stock web client in a web tab. Seed:
`.planning/seeds/SEED-261103-o1g-orca-mode-milestone.md`. The client and orcad came from
`orca-ide` 1.4.245; orcad build `0.1.0+17ab00fcbb7f`.

## Requirements

- Orca is a third pinned upstream. It is consumed by version and never patched or vendored,
  the same rule as Theia.
- PB spawns orcad itself as a second token-gated sidecar. No Orca desktop install may be
  required.
- Pairing is automatic: the user never types a pairing code.
- The first GUI slice is an "Orca" mode next to Coding, hosting the stock web client.
- Nothing edits Theia core, Gecko outside the patch stack, or the TabUriRegistry shape.

## How to Build It

1. **Pick a PB-owned profile with `ORCA_USER_DATA_PATH=<pb-owned dir>`.** `--data-root` does
   not scope `serve`. Remove every other inherited `ORCA_*` variable: a PB launched from an
   Orca terminal inherits the desktop's values.
2. **Spawn orcad directly, not through `orca serve`.** `orca serve` hardcodes `--bind 0.0.0.0`
   (`out/shared/orcad-serve-argv.js`), and orcad then warns that anyone who can reach the port
   can attempt pairing. orcad's own `--bind` defaults to `127.0.0.1`. Use the same shape
   `serveWithOrcad` uses (`out/cli/runtime/serve-orcad-launch.js`):
   - Program: orcad's Node runtime.
   - Args: the orcad entry, then `--bind 127.0.0.1 --web-client-root <…/app.asar.unpacked/out/mobile-web>`.
   - Env: `ORCA_USER_DATA`, `ORCA_VERSION`.

   **This step was not run in spike 003.** Prove it before relying on it.
3. **Read the pairing URL from orcad's ready JSON.** In the
   `{"type":"orca_server_ready", …}` object, the field is `pairing.webClientUrl`:
   `http://127.0.0.1:<port>/web-index.html#pairing=<urlencoded orca://pair?code=…>`.
   The default port is 6768, and orcad moves to the next free port when it is taken. Always
   read the port from the output.
4. **Open that URL as a PB web tab** (`WebTabOpenHandler.openUrl`). The client pairs with no
   prompt and removes the fragment from `location`. The token gate needs no allowlist entry or
   loopback exemption: it only guards inbound requests to PB's own sidecar.
5. **Register projects explicitly** (`orca repo add --path …`, or the equivalent RPC).
   `--project-root` alone leaves the client at "No workspaces found".
6. **Tear down on quit.** The terminal daemon and its agent sessions outlive the server process
   by design. A PB-spawned orcad needs explicit teardown, matching the sidecar's parent
   watchdog.

Probe pattern (gate on, headless PB): `sources/003-orca-headless-client-in-pb/probe.mjs`.
The probe opens the URL with `withProbeShell` + `openWebTab`, reads the DOM over BiDi
`evaluateIn`, takes screenshots with `browsingContext.captureScreenshot`, and types into the
xterm with `input.performActions` on the content context.

## What to Avoid

- **Running orcad on the user's real Orca profile.** That profile is locked by the running desktop
  app (`runtime_serve_already_running`, exit 3). If it has SSH targets, serve also falls back
  to Electron serve, because orcad cannot serve them yet.
- **Letting the pairing URL leak.** One offer paired three separate fresh profiles, so the URL
  is a reusable bearer credential for the whole runtime. Keep it out of history, session
  restore, logs and anything user-visible.
- **Matching the tab by its exact URL.** The client strips `#pairing=…`, so match on origin.
- **Assuming a Nix dev-shell PATH.** orcad builds its own agent PATH: FHS-env tools,
  `<userData>/cli/bin`, `~/.local/bin`, then a fixed list of common user tool dirs. Removing
  `POWERBROWSER_*` in the sidecar does not affect it.
- **Inheriting Orca's agent defaults unreviewed.** A fresh profile launches Claude with
  `--dangerously-skip-permissions`. This is a product decision for the Orca mode.

## Constraints

- orcad is Node 24, not Electron. The web client bundle ships inside the app at
  `resources/app.asar.unpacked/out/mobile-web/`.
- The pairing offer is base64url JSON `{v:2, endpoint, deviceToken, publicKeyB64,
  pairedDeviceId, scope:"runtime", hostDescriptor}`. The connection is end-to-end encrypted with
  a device key.
- On a temporary profile, orcad stores credentials unencrypted. This is not yet checked for a
  persistent PB-owned profile.
- The web client has no URL router, so single-view routes are a design decision, not a
  configuration option.
- Verified only on Linux/NixOS, where the package runs agent shells in
  `orca-ide-<ver>-fhsenv`.

## Origin

Synthesized from spike 003 (VALIDATED, 2026-11-03).
Sources: `sources/003-orca-headless-client-in-pb/` (README, results.md, probe.mjs).
