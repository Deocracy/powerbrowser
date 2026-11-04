---
spike: 003
idea: orca-client-in-pb
name: orca-headless-client-in-pb
type: standard
validates: "Given `orca serve` running with no Orca desktop app, when its web client is loaded in a PowerBrowser web tab with the pairing offer injected, then a workspace and an agent terminal render and the agent can run a command"
verdict: PENDING
related: [SEED-261103-o1g, GUI-02, phase-38-07-webview-token-gate]
tags: [orca, orcad, sidecar, token-gate, pairing, web-tab, live-probe]
---

# Spike 003: Orca headless client inside PowerBrowser

## What This Validates

Given `orca serve` (Orca CLI 1.4.245 installed at `~/.config/orca/linux-orca-cli-shim/orca`)
started with no Orca desktop window, when the browser URL it prints is opened in a
PowerBrowser web tab, then:

1. **Headless daemon.** The daemon runs without the desktop app and serves the web client
   bundle. If the bundle is absent from the installed CLI, record that: it changes how PB
   must ship the client.
2. **Automatic pairing.** `orca serve --json` prints a browser URL with the pairing data
   embedded (per `orca serve --help`). Opening that URL pairs the client without the user
   typing a code. Confirm the JSON field name and that the URL works on a fresh profile.
3. **Token gate.** The client's WebSocket RPC to orcad works from inside a PB web tab under
   the sidecar's token gate, including the WebSocket-upgrade rule from phase 38-07. Record
   whether orcad's port needs an egress allowlist entry or a loopback exemption.
4. **Agent spawn environment.** From the paired client, open one workspace on a throwaway
   repo and start one agent session (Claude Code). The agent must find its binary and
   credentials and run `pwd`. Record the PATH the session saw. Note that PB's Theia sidecar
   strips `POWERBROWSER_*` from the environment and a plain launch does not have the Nix
   dev-shell PATH; orcad is launched by hand in this spike, so this check establishes the
   baseline a PB-spawned orcad must match later.

Settled elsewhere and not re-tested here: orcad is Electron-free (Orca's CI ratchet in
`config/scripts/check-runtime-electron-ratchet.mjs`), Organising-mode tiling of web tabs,
Gecko WebDriver BiDi parity with Orca's CDP automation (deferred to the provider phase).

Out of scope: single-view routes (the web client has no URL router; this is a milestone
design decision, not a spike), the Orca mode itself, any PB code change.

## Research

- `orca serve --help`: runs in the foreground, uses port 6768 or the next free one, prints
  the bound endpoint, advertised endpoint and pairing status. `--json` emits machine-readable
  output. "When the web client bundle is available, the server also prints a browser URL
  with the pairing data embedded." `--no-pairing` disables pairing. `--data-root <dir>`
  keeps the spike's state out of the user's real Orca data.
- Web client pairing: `orca-eval/src/renderer/src/web/WebConnect.tsx` accepts an
  `orca://pair?...` URL or code; `web-pairing.ts` parses it; the connection is end-to-end
  encrypted with a device key (`web-device-key.ts`, `web-e2ee.ts`).
- PB web tabs: `theia/extensions/tab-uris/src/browser/web-tab.ts`; token gate and webview
  host rule: `theia/extensions/token-gate/`; live GUI loop: run the sidecar standalone on
  port 4000 with `POWERBROWSER_TOKEN_DISABLE=1` only if the gated run fails, and record both.

## How to Run

```sh
# 1. Headless daemon with isolated state and a throwaway project
mkdir -p /tmp/orca-spike/repo && git -C /tmp/orca-spike/repo init -q
orca serve --json --data-root /tmp/orca-spike/data --project-root /tmp/orca-spike/repo
# Record: bound endpoint, pairing status, the browser URL (or its absence).

# 2. Open the browser URL in a PowerBrowser web tab (built PB at objdir/dist/bin/powerbrowser,
#    fresh profile). Record pairing result and any console errors.

# 3. In the paired client: open the throwaway repo as a workspace, start a Claude Code
#    session, run `pwd` and `echo $PATH`. Record output.

# 4. Repeat step 2 against a stock Firefox window (GUI-01, window.open) as the control:
#    if the client pairs there but not in the web tab, the token gate is the cause.
```

## What to Expect

- Step 1 prints a `http://127.0.0.1:<port>/...` URL carrying the pairing offer. No URL
  means the CLI shim ships no web bundle; record the bundle location Orca desktop uses.
- Step 2 shows the Orca workspace list with no pairing prompt.
- Step 3 shows a terminal with a live Claude Code session; `pwd` prints the repo path.
- Step 4 behaves the same as step 2.

## Results

Fill in `results.md` next to this file: one row per sub-check with PASS / FAIL and the
observed value. Set `verdict` in the frontmatter to VALIDATED only when all four pass, PARTIAL
when the daemon and pairing pass but the gate or the agent environment fails, INVALIDATED
when the daemon cannot run headless or cannot pair automatically.

## Investigation Trail

- 2026-11-03: spike defined from the /gsd-explore session. Not yet run.
