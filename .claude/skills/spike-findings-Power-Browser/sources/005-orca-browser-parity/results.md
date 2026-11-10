# Spike 005 results — 2026-11-09

Orca 1.4.248 @ 965978bc (source build in this lane: `scripts/build-orca.sh`, then the CLI by
`build:packages` and `build-cli.mjs`), orcad on the official Node 24.19.0 from
`powerbrowser/packaging/node-runtime.json`, PB at
`/home/chris/orca/workspaces/Power-Browser/v1.7-Orca-integration/objdir/dist/bin/powerbrowser`
(built 2026-11-08 21:08, Gecko 153.5.1), headless BiDi harness `scripts/lib/pb-live-probe.mjs`.
Raw proof output: `results-proof.json`.

| # | Sub-check | Result | Observed | Command |
|---|-----------|--------|----------|---------|
| 1 | Parity derivation | PASS | 65 automation methods, 92 RPC abilities, 83 provider members, 80 CLI specs (78 names used under `src/cli/`); 27 RPC names outside the automation list, 0 automation names without an RPC; 92 table rows, abilities and users equal both ways | `scripts/verify-platform.sh --only orca-browser-parity` |
| 2 | Parity self-test | PASS | clean control green, no-tree fixture SKIPs, 9 planted faults each red naming the drift | `scripts/verify-platform.sh --only orca-browser-parity-self-test` |
| 3 | PB half: navigate and read title | PASS | `{url: <fixture>/pb, title: "P61 PB half <nonce>"}` in 270 ms; `webTabNavigate` replied `{ok: true, where: "loading"}`; title from the `PowerBrowserWebTabState` push | `provider-proof.mjs` (below) |
| 4 | S2 attach accepted | PASS | `browser.clientHost.attach` answered `ready` in 254 ms to a PB runtime client in the Theia frame (origin `http://127.0.0.1:<sidecar port>`, secure context); no Orca file edited | same |
| 5 | goto through orcad | PASS | Orca CLI `tab create` 171 ms, then `goto --url <fixture>/s2 --page <id>` returned `{url, title: "P61 S2 half <nonce>"}` in 162 ms; the host saw `createPage` and `automation` (`browser.goto`), both results acknowledged | same |
| 6 | S1 patch applies | PASS | `git -C orca apply --check` accepts `s1-browser-provider-kind.patch`; tracked Orca files unmodified afterwards | `git -C orca apply --check ../.planning/spikes/005-orca-browser-parity/s1-browser-provider-kind.patch` |
| 7 | S1 line count | recorded | 13 changed lines (12 added, 1 removed) in one file, `src/main/orcad/orcad-browser-provider.ts` | `git -C orca apply --numstat <patch>` |
| — | Control: teardown | PASS | `stopOrcad` reported no survivors; `git -C orca status --porcelain --untracked-files=no` empty | end of `provider-proof.mjs` |

Proof command:

```sh
nix develop .#orca --command bash .planning/spikes/005-orca-browser-parity/build-s2-host.sh
PB_FIREFOX_BIN=/home/chris/orca/workspaces/Power-Browser/v1.7-Orca-integration/objdir/dist/bin/powerbrowser \
  flock /home/chris/coding/Power-Browser/.git/pb-live.lock \
  node .planning/spikes/005-orca-browser-parity/provider-proof.mjs
```

Last line of the passing run:
`provider-proof: PASS -- PB half end to end (270 ms); S2 attach accepted; S2 half end to end through orcad (162 ms)`

**Verdict: YELLOW (conditions).** Both halves ran end to end through S2. The conditions are in
the README's VERDICT section.

## Findings the README's plan did not predict

1. **orcad serves only an allow-list of paths.** `static-web-client-handler.ts:7-8` allows
   `/web-index.html` and the prefixes `/assets/`, `/cmaps/`, `/standard_fonts/`, `/wasm/`. A
   PB-added bundle at `out/web/pb-s2/` answered 404; under `out/web/assets/pb-s2/` it loads. An
   installed build with a `.orca-web-client-files.json` manifest would refuse it there too
   (`bundled-web-client-manifest.ts`). This also binds any PB-added page of spike 004.
2. **The lease is bound to one connection.** `browser.clientHost.commandResult` is settled against
   the attach's connection id. The web client's public `subscribe()` opens a dedicated socket for
   every stream, so a result sent with `client.call()` would arrive on another connection. The
   proof calls the private `subscribeOnCurrentConnection` to keep one socket.
3. **The web client's capability list is a module constant.** `WEB_RUNTIME_CLIENT_CAPABILITIES`
   has no option to extend it; the proof appends `browser.clientHost.v1` to the array at run time.
   Token authentication over the legacy framing does carry `clientCapabilities`
   (`paired-e2ee-client-handshake.ts:136`), so no device key was needed.
4. **Client-hosted pages need a workspace.** `createBrowserClientPage` refuses without one. The
   proof registers a throwaway repository (`repo add`) and targets it as `--worktree path:<repo>`;
   no `worktree create` ran, so nothing was written under `~/orca/workspaces`.
5. **Host selection needs two host capabilities.** `selectPairedPageHost` requires `webview` and
   `automation-v1` in `hostCapabilities`, and page creation requires page-command and
   reconciliation protocol version 1, which in turn requires inventory version 1.
6. **`build-orca.sh` does not build the CLI.** `orca/out/cli/index.js` came from the two steps the
   Phase 60 EXT-01 record names (`pnpm run build:packages`, then
   `ORCA_CLI_BUILD_COMPILER=tsrs node config/scripts/build-cli.mjs`), never `prepare:cli-output`.
7. **The bundle is 19.3 MB (269 modules).** Reusing `web-runtime-client.ts` pulls a large part of
   the renderer's module graph. Phase 66 should not ship this bundle.
8. **Derived orcad users are 5 names, not the 14 the research listed.** The script counts quoted
   `'browser.<name>'` literals only; the research grep also matched unquoted property access.
9. **Harness trap.** A blocking `spawnSync` of the CLI stopped the in-process fixture HTTP server,
   so the page the command waited for never finished loading (20 s timeout, run 3). The CLI calls
   are asynchronous now.
