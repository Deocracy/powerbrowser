# Spike 003 results — 2026-11-03

Orca CLI 1.4.245 (`orca-ide-1.4.245` Nix store build), PB at `objdir/dist/bin/powerbrowser`
(built 2026-11-03 14:45), headless BiDi harness `scripts/lib/pb-live-probe.mjs`, token gate ON
(`POWERBROWSER_TOKEN_DISABLE` unset). Raw probe output: `probe-gate-on.json`; screenshots
`web-tab.png`, `web-tab-terminal.png`, `web-tab-typed.png`, `stock-window.png`.

| # | Sub-check | Result | Observed |
|---|-----------|--------|----------|
| 1 | Headless daemon | PASS | `orca serve` printed `[serve] running on orcad 0.1.0+17ab00fcbb7f`; Node 24.22.1, no Electron process, no window (`desktopWindowStatus: blocked`). Serves `/web-index.html` (200, `text/html`, `Cache-Control: no-cache`) from the bundle at `resources/app.asar.unpacked/out/mobile-web/`, passed to orcad as `--web-client-root`. Bound `ws://0.0.0.0:6770` (6768 was taken). |
| 2 | Automatic pairing | PASS | JSON field: `pairing.webClientUrl` = `http://127.0.0.1:<port>/web-index.html#pairing=<urlencoded orca://pair?code=…>`. The offer is base64url JSON `{v:2, endpoint, deviceToken, publicKeyB64, pairedDeviceId, scope:"runtime", hostDescriptor}`. Each of three fresh PB profiles opened the URL and showed the workspace list with no prompt; the client removes the fragment from `location` after reading it. |
| 3 | Token gate | PASS | Web tab loaded the page and its WebSocket RPC connected with the gate on. Status bar shows "1 host". No egress allowlist entry or loopback exemption was needed: the gate only guards inbound requests to PB's own sidecar (`token-gate-backend-contribution.ts`) and does not filter what a web tab connects to. The gate-off run was not needed. |
| 4 | Agent spawn environment | PASS | Claude Code v2.1.314 found its binary and the user's credentials ("Claude Ultra"). It ran `pwd` → `/tmp/orca-spike/repo`. The terminal rendered live in the PB web tab. A prompt typed into that terminal from the web tab (BiDi key input) made the agent run `echo pb-web-tab-1793754825674`, and the output came back. |
| — | Control: stock window (GUI-01) | PASS | `window.open` from Theia → stock window on the same URL showed the same paired workspace. It shares the profile's localStorage with the web tab, so this control does not test pairing independently. |

**Verdict: VALIDATED.** All four checks pass, with the qualifications below.

## PATH the agent session saw

The shell prompt was `orca-ide-1.4.245-fhsenv:chris@legion` (the nixpkgs package's FHS env).
orcad builds the PATH itself, in this order: FHS-env tools (procps, ripgrep, bubblewrap, socat),
`<userData>/cli/bin`, `~/.local/bin`, `/run/wrappers/bin`, `/usr/bin`, the Orca CLI shim dir,
bash/binutils/coreutils/gawk from the store, then a fixed list of common user tool dirs
(`~/.nix-profile/bin`, `/etc/profiles/per-user/chris/bin`, `/run/current-system/sw/bin`, volta,
asdf, fnm, mise, pnpm, yarn, bun, homebrew, `/usr/local/bin`, snap, `~/.opencode/bin`, …).
orcad was launched with every `ORCA_*` variable removed and with a plain user PATH. **No Nix
dev-shell PATH is present.** A PB-spawned orcad gets an equivalent PATH from orcad itself, and
`POWERBROWSER_*` removal by the sidecar does not affect it.

## Findings the README did not predict

1. **`--data-root` does not isolate `serve`.** It only scopes `--reclaim-stale-lock`. The first
   attempt failed with `runtime_serve_already_running` against the desktop app's profile.
   Profile selection is `ORCA_USER_DATA_PATH` (`cli/runtime/launch-user-data-path.js`).
   PB must set it to a PB-owned directory.
2. **orcad vs Electron serve is decided by profile content.** The user's real profile fell back
   to "Electron serve: this profile has SSH targets, which orcad cannot serve yet". A fresh
   PB-owned profile selects orcad.
3. **`orca serve` always binds 0.0.0.0.** `shared/orcad-serve-argv.js` hardcodes
   `--bind 0.0.0.0`, and orcad warns "reachable from the network. Anything that can reach this
   port can attempt pairing." orcad's own `--bind` defaults to `127.0.0.1`
   (`orcad-template/orcad-server.js`). PB's sidecar refuses non-loopback binds, so PB should
   spawn orcad directly (`node-runtime` + `orcad-template/orcad-server.js --bind 127.0.0.1
   --web-client-root …`) rather than through `orca serve`. **Not run in this spike.**
4. **The pairing offer is reusable.** Three separate fresh profiles paired with one offer, so
   `webClientUrl` is a bearer credential for the whole runtime. PB must keep it out of
   history, session restore and anything user-visible (UI-SPEC: no internal identifiers in
   copy).
5. **A fresh Orca profile launches Claude with `--dangerously-skip-permissions`.** Claude then
   shows its one-time bypass warning in the terminal. The spike accepted it for the throwaway
   repo. A PB-owned profile inherits this default, so the Orca mode milestone must decide it.
6. **`--project-root` does not register a project for the web client.** The client showed
   "No workspaces found" until `orca repo add --path` ran.
7. Credentials temporarily stored unencrypted: "[secrets] Orca's headless server is running from a temporary
   profile, so it stores credentials unencrypted". This needs checking for a PB-owned
   persistent profile.

8. **The terminal daemon outlives `orca serve`.** After SIGINT stopped serve, the terminal-host
   node process and the Claude session kept running. The spike killed them by hand. A PB-spawned
   orcad needs an explicit teardown on quit, matching the sidecar's parent watchdog.

## Deviation from How to Run

Step 3 was not run purely in the client UI. The project was added with `orca repo add` and the
agent was started with `orca agent launch --agent claude --surface terminal`, both against the
spike runtime. The client→agent path was then checked from the web tab: open the workspace,
render the terminal, type a prompt, and see the agent run the command. "Add project" in the web
client was not exercised.
