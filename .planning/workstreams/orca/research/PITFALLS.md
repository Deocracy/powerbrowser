# Pitfalls Research

**Domain:** Adding a PB-spawned headless Orca runtime (orcad), an "Orca" mode, `pb-orca:` tabs, JSWindowActor branding injection, Add-project UI, a credential-storage check, and a Gecko replacement for Orca's Chromium browser to an existing Gecko + Theia platform (Power Browser v1.7)
**Researched:** 2026-11-04
**Confidence:** MEDIUM-HIGH. Findings marked **[src]** were read in the PB tree or the Orca source/bundle on this machine. Findings marked **[live]** were seen running in spike 003. Findings marked **[unverified]** are inference or general platform knowledge and each names the check that would settle it.

**Sources read for this file**
- PB tree: `CLAUDE.md`, `powerbrowser/shell/TheiaService.sys.mjs`, `powerbrowser/shell/PowerBrowserAPI.sys.mjs`, `powerbrowser/shell/powerbrowser.js`, `powerbrowser/INTERNAL-APIS.md`, `docs/URI-SCHEMES.md`, `docs/CRASH-POLICY.md`, `theia/extensions/chrome-bar/src/browser/chrome-bar-shortcuts.ts`, `theia/extensions/tab-uris/src/browser/web-tab.ts`, `scripts/verify-ng-069-sidecar-egress.mjs`, `scripts/verify-flathub-manifest.mjs`, `scripts/verify-platform.sh`, `flatpak/org.debios.PowerBrowser.json`, `nix/pkg/powerbrowser-bin.nix`.
- Orca source clone `/home/chris/coding/orca-eval` (HEAD 3052dd79, 1.4.214). Installed bundle `/nix/store/zqzrjgzy297m4b7pgr0k2165l3wmhix8-orca-ide-1.4.245-extracted/resources/` (1.4.245). Line numbers below are from 1.4.214; strings and file layout were re-checked in 1.4.245 only where stated.
- `.planning/spikes/003-orca-headless-client-in-pb/results.md`, `.claude/skills/spike-findings-Power-Browser/references/orca-client-hosting.md`, `ORCA-REBRAND-SURVEY.md` sections 7-8, `research/INPUTS.md`.

**Two corrections to inherited text**
1. `INPUTS.md` says the profile variable is `ORCA_USER_DATA`. That is right for orcad (`src/main/orcad/orcad-app-paths.ts:15`, `src/cli/runtime/serve-orcad-launch.ts:83`). The Orca CLI reads `ORCA_USER_DATA_PATH` (`src/cli/runtime/launch-user-data-path.ts:12`, `metadata.ts:46`). If PB ever runs any `orca` CLI command (Add-project uses `orca repo add`), both must point at the same directory, or the CLI talks to the user's desktop profile.
2. The web client is the desktop renderer built in web mode, served from `app.asar.unpacked/out/renderer/web-index.html` (verified: `out/renderer` contains `web-index.html`; `out/mobile-web` does not). The bundle contains `TabGroupSplit` code. So the nested-split pitfall (P-15) applies. `out/mobile-web` is the phone app's web build and is not what orcad serves.

---

## Critical Pitfalls

### Pitfall 1: The pairing URL is a reusable bearer credential and leaks through every URL-bearing surface in PB

**What goes wrong:** `pairing.webClientUrl` (`http://127.0.0.1:<port>/web-index.html#pairing=<orca://pair?code=...>`) grants full control of the runtime: terminals, agents started with `--dangerously-skip-permissions`, file access through agents. One offer paired three fresh profiles **[live]**. PB already persists and displays web-tab URLs in at least these places, each of which would now hold the credential:
- `tabs.sqlite` row column `url TEXT NOT NULL` (`PowerBrowserAPI.sys.mjs:58-63`; `docs/URI-SCHEMES.md:254-257` "with the page address as a column"). This store is readable by the Theia backend through `TabQueryService` / tab-store-access, so it is also readable by Theia's AI features.
- Sessionstore and `web-tab-histories.json` (`saveWebTabHistories`, `PowerBrowserAPI.sys.mjs:807-827`, collects `currentURI.spec` and the full back/forward list at quit).
- Places history, bookmarks, chrome-bar suggestions (`chrome-bar-places-suggestions.ts`), named setups (restore tabs "through the opener" per `web-tab.ts` header).
- The address pill and tab caption (the user sees the code on screen).
- `PowerBrowserAPI.log()` does `dump()` to stdout and `console` (`PowerBrowserAPI.sys.mjs:917-921`). Any code that logs orcad's ready line, the open request or a failed-open error prints the offer.
- Crash reports: `docs/CRASH-POLICY.md:107` says reports can contain page URLs and memory (consent-gated).
- Process arguments: do not pass the offer to a child on argv.

**Why it happens:** the spike's working path is "open this URL as a web tab", and every generic web-tab mechanism records URLs by design. The client removes `#pairing` from `location` after reading it (spike) but that does not undo records already written at navigation time. Whether Places records the fragment form is **[unverified]**; assume it does.

**How to avoid:**
- The `pb-orca:` URI carries no secret and no URL (`docs/URI-SCHEMES.md:4` already forbids query, fragment and encoded payloads in a tab address). Chrome keeps the offer in memory only and resolves it at open time.
- Load the offer-bearing URL with a no-history load flag (`LOAD_FLAGS_BYPASS_HISTORY`, **[unverified]** that the web-tab overlay path can pass it) and write the tab-store row with the origin-only URL (`http://127.0.0.1:<port>/web-index.html`) before the offer-bearing navigation starts.
- Alternative that removes the secret from URLs entirely: open the origin-only URL and let the new JSWindowActor deliver the offer to the page (needs the actor to know Orca's pairing intake; decide in the injection phase).
- Never log the ready line. Parse it in one function that returns a typed object whose `toString`/JSON redacts the offer.
- Treat a persisted pairing as a revocable device: on `pb-orca:` removal or "Reset Orca", delete the device record (RPC or profile reset), because the offer cannot be un-leaked.

**Warning signs:** `pairing=` or `orca://pair` appears in `places.sqlite`, `tabs.sqlite`, `sessionstore-backups/*.jsonlz4`, `web-tab-histories.json`, the profile's `groups`/setups JSON, or the PB stdout log. A tab caption showing a long `127.0.0.1` URL.

**Check (verify-platform.sh row, live tier):** launch with a canary offer string in the open path, quit, then scan the profile directory (every file, decompressing jsonlz4 and opening sqlite read-only) and the captured stdout/stderr for the canary. The same scan must have a control: plant the canary through an ordinary web tab and require the scan to find it (otherwise the scan can never go red; `CLAUDE.md` "Verification" rule 1). Plus a `--quick` static row: only one module may reference `webClientUrl`/`pairing`; derive the module list from `git ls-files`, require the set to equal one file.

**Phase to address:** the phase that creates the orcad supervisor and `pb-orca:` opener. Do this before any UI exists.

---

### Pitfall 2: A PB launched from an Orca terminal passes its ORCA_* environment, and `spawnProcess` cannot remove variables

**What goes wrong:** `PowerBrowserAPI.spawnProcess` always uses `environmentAppend: true` (`PowerBrowserAPI.sys.mjs:576-584`), which merges onto the parent environment. It can set a variable (the existing code sets `POWERBROWSER_TOKEN_DISABLE: ""`) but cannot unset one. The Orca source reads 133 distinct `ORCA_*` variables outside tests (counted with `grep -rhoE process\.env\.ORCA_[A-Z_0-9]+` over `src/cli`, `src/main`, `src/shared`, excluding `*.test.ts`), including:
- `ORCA_USER_DATA` / `ORCA_USER_DATA_PATH` (profile selection; a desktop value makes orcad use the user's real, locked profile, `runtime_serve_already_running` exit 3 **[live]**),
- `ORCA_AGENT_HOOK_PORT`, `ORCA_AGENT_HOOK_TOKEN`, `ORCA_AGENT_HOOK_ENDPOINT` (agent children would post status to the *desktop's* hook server with the desktop's token),
- `ORCA_TERMINAL_HANDLE`, `ORCA_PANE_KEY`, `ORCA_WORKTREE_ID`, `ORCA_TAB_ID`, `ORCA_WORKSPACE_ID`, `ORCA_CLI_CWD`,
- `ORCA_APP_VERSION` (orcad overwrites it from its own bundle, `orcad-host-adapters.ts:61-74`),
- `ORCA_HEADLESS_SECRET_STORE=plaintext` (`orcad-secret-protection-gap.ts:1`): an inherited value silently stores credentials unencrypted.

Empty-string overrides are not equivalent to unset: code that checks `'X' in env` or `!== undefined` treats `""` as set.

**Why it happens:** the existing helper was written for the Theia sidecar, which wants the user's environment. Dropping vars one by one from a hand-kept list also goes stale at every Orca release (the list is exactly the "hand-kept expectation list" `CLAUDE.md` forbids).

**How to avoid:**
- Add a second spawn method to `PowerBrowserAPI.sys.mjs` with `environmentAppend: false` and an explicit pass-through list (PATH, HOME, USER/LOGNAME, LANG/LC_*, TERM, XDG_*, DISPLAY, WAYLAND_DISPLAY, SSH_AUTH_SOCK, proxy variables, TMPDIR, SystemRoot/USERPROFILE/APPDATA on Windows). This is a new `INTERNAL-APIS.md` catalogue row and `scripts/check-internals-boundary.sh --catalogue` must pass.
- Rule by prefix, not by list: pass nothing matching `^ORCA_`, `^ORCAD_`, `^TERM_PROGRAM`, then set the exact PB-owned values (`ORCA_USER_DATA`, `ORCA_USER_DATA_PATH`, `ORCA_VERSION`, `DO_NOT_TRACK=1`, `ORCA_TELEMETRY_DISABLED=1`).
- Note the interaction with NG-069: its egress preload is injected through `NODE_OPTIONS` (`verify-ng-069-sidecar-egress.mjs:57-58`). A whitelist scrub drops it, so the check must pass the preload explicitly (see P-8).
- orcad builds the agent PATH itself (spike 003 "PATH the agent session saw"), so scrubbing PATH-like variables does not change what agents find. Do not rely on scrubbing to hide a Nix dev-shell PATH either.

**Warning signs:** `orcad` exits 3 with `runtime_serve_already_running` when the desktop app is open; agent status never appears or appears in the desktop app; `/proc/<orcad pid>/environ` contains any `ORCA_` key PB did not set.

**Check:** live row: start the harness with a poisoned environment (`ORCA_AGENT_HOOK_PORT`, `ORCA_WORKTREE_ID`, `ORCA_HEADLESS_SECRET_STORE=plaintext`, `ORCA_USER_DATA_PATH=<desktop dir>`), read `/proc/<pid>/environ` of orcad and its terminal-daemon child, and compare the key set to the set PB writes. Derive the "poison" keys from `grep -o 'process\.env\.ORCA_[A-Z_]*'` over the fetched orcad bundle at check time, so a new Orca release that reads a new variable is covered without a code edit.

**Phase to address:** orcad supervisor phase. Windows/macOS equivalents (case-insensitive env on Windows) belong to the per-OS packaging phase.

---

### Pitfall 3: orcad exposed beyond loopback (via `orca serve`, `--bind`, a second listener, or a WSL/IPv6 variant)

**What goes wrong:** `orca serve` hardcodes `--bind 0.0.0.0` (`out/shared/orcad-serve-argv.js`, **[live]**: bound `ws://0.0.0.0:6770`). orcad's own default is `127.0.0.1` (`src/main/orcad/orcad-bind-address.ts:1-24`); `bindHostIsNetworkExposed` treats `0.0.0.0`, `::` and any non-`127.*`/`::1` address as exposed. Anyone on the LAN can then attempt pairing against a runtime that starts agents with permission prompts disabled.

**Why it happens:** the easy way to start the runtime is the documented CLI command; the spike used it.

**How to avoid:** spawn the node runtime with `orcad-server.js --bind 127.0.0.1 --web-client-root <.../out/renderer>` directly. Pass the literal `127.0.0.1` (orcad refuses hostnames, `orcad-bind-address.ts:20-26`; `localhost` is mapped to `127.0.0.1`). Treat `boundEndpoint` in the ready JSON as untrusted until it starts with `ws://127.0.0.1:`; if not, kill orcad and show PB copy.

Other listeners to account for: the agent-hook server (`ORCA_AGENT_HOOK_PORT`), any `--ws-port` fallback in managed mode (`orcad-ws-port-policy.ts`), the terminal daemon socket.

**Warning signs:** orcad prints "reachable from the network. Anything that can reach this port can attempt pairing." (`describeOrcadBindExposure`).

**Check:** two assertions, neither an absence-of-log assertion. (1) `boundEndpoint` starts with `ws://127.0.0.1:`. (2) An independent kernel view: parse `/proc/net/tcp{,6}` (Linux), `lsof -nP -iTCP -sTCP:LISTEN` (macOS), `Get-NetTCPConnection` (Windows) for every pid in the orcad process tree; every listening socket must have a loopback local address. `--self-test` starts orcad with `--bind 0.0.0.0` and requires both assertions to go red.

**Phase to address:** orcad supervisor phase.

---

### Pitfall 4: Orphaned terminal daemon and agent sessions after PB quits, crashes or is killed

**What goes wrong:** by design the terminal daemon and its agent sessions outlive the orcad server (`orcad-managed-idle-exit.ts:1` "ordinary shutdown disconnects without killing their daemon"; spike finding 8 **[live]**: after SIGINT the terminal-host node and the Claude session kept running). Agents launched with `--dangerously-skip-permissions` keep running unattended, holding tokens and a profile lock. PB's existing teardown covers only the Theia sidecar: the watchdog reads EOF on the sidecar's stdin (`TheiaService.sys.mjs:921-924`), and the leftover reap is Linux-only (`signalBarePid` returns false off Linux, `INTERNAL-APIS.md:84`; "A Windows leftover sidecar is therefore not reaped"). orcad has no known parent-death watchdog **[unverified]**: `kill -9` of PB leaves orcad, the daemon, agents and `orcad.lock` behind.

There is also a product conflict: killing the daemon on every quit destroys long-running agent work that Orca users expect to survive; never killing it leaks processes. Neither is free, so it needs an explicit owner decision.

**How to avoid:**
- Decide the policy first: "quit stops everything" versus "sessions survive and PB re-adopts on next start". Recommend: stop on quit by default, with a quit-time notice in PB copy when sessions are live.
- Use orcad's own managed lifecycle instead of kill: `ORCAD_MANAGED_ACTIVATION_ROOT_ENV` enables client-managed idle exit (`orcad-managed-idle-exit.ts:19-35`, "User-started/paired servers never idle out; only client-managed launches opt in"), and there is a managed-stop command with `retireIdleDaemon` (`orcad-managed-stop-command.ts`). Both are **[unverified]** as usable by a third-party launcher; the spike phase must prove them.
- Record `{pid, start ticks}` for orcad and the daemon in a state file and reuse the D-111 identity rule from `_reapLeftover` (exact start-time equality before any signal). On Windows use a Job Object with kill-on-close, and check `orcad-windows-conpty-breakaway.integration.test.ts` for the breakaway behaviour that would defeat it.
- On the next start, detect a live orcad that owns the profile (`orcad.lock`, `orcad_instance_lock_held`) and either adopt or reap it; never start a second orcad on the same data root (it refuses; `orcad-instance-lock.ts:242-296`).
- Drain stdout and stderr continuously. `spawnProcess` pipes stderr (`PowerBrowserAPI.sys.mjs:582`); an unread pipe fills and blocks orcad.

**Warning signs:** `ps` after quit shows `node-runtime/bin/node` processes with `orcad-server.js` or `daemon-entry.js`; `orcad.lock` present with no PB; a second PB start fails with a lock error.

**Check:** live row "quit leaves nothing": start, spawn a sentinel terminal command, quit PB normally, then `kill -9` PB in a second case; in both, assert no process whose executable is under the fetched Orca directory remains (match by path prefix, not by name). Windows variant can only be a manual item until a Windows runner exists (memory: "Windows sign never blocks Linux"; keep it from blocking Linux).

**Phase to address:** orcad supervisor phase (policy and Linux), per-OS phase (macOS, Windows).

---

### Pitfall 5: The Orca page shares a cookie jar and site with PB's own sidecar

**What goes wrong:** PB's sidecar token is an HttpOnly, SameSite=Lax session cookie for host `127.0.0.1` (`PowerBrowserAPI.sys.mjs:543-553`, `TOKEN_COOKIE_HOST = "127.0.0.1"`, line 6443). Cookies are not scoped by port. The Orca web client is served from `http://127.0.0.1:<orcad port>/`, so:
- every request the Orca page makes to orcad carries the PB sidecar token cookie (leaked to orcad and anything between);
- the page is same-site with the sidecar, so Lax does not stop a request from Orca-page JavaScript to `http://127.0.0.1:<theia port>/`. The token gate checks the cookie only; `grep -i origin theia/extensions/token-gate/src/node/*.ts` finds nothing but the webview-origin handling. A WebSocket upgrade does not use CORS, so a cross-origin WebSocket to the Theia backend, which has terminal and file access (`INTERNAL-APIS.md:66` row about `ShellExecutionServer`), would be authenticated by the cookie. Orca renders agent-produced content (markdown, HTML previews), so "page JavaScript" includes content an agent or a repository wrote. **[unverified]** end to end; the individual facts are **[src]**.
- The same is true in the other direction for the existing `PowerBrowserGroup` actor: its `matches` is `http://127.0.0.1/*` and "MatchPattern compares hosts only" (`PowerBrowserAPI.sys.mjs:2280`, comment at 276-290), so its child loads in the Orca page. NG-038's port/primary-browser wall in the parent is what refuses it. Do not weaken that wall, and apply the same discipline to the new branding actor (P-11).

**How to avoid:** (a) add an `Origin`/`Host` check to the token gate (a `@powerbrowser/token-gate` change, allowed by the Theia rule) that rejects any request whose `Origin` is not the sidecar's own origin; (b) serve and open the Orca tab on `http://localhost:<port>/` instead of `127.0.0.1`, which is a different cookie host and a different site, if orcad accepts it (the pairing `endpoint` stays `ws://127.0.0.1`; **[unverified]**); (c) for belt and braces, run the Orca tab in a separate container/`userContextId` so the cookie jar is distinct (**[unverified]** with the shell-overlay web tab).

**Check:** live probe from inside the Orca tab (BiDi `script.evaluate` in the page): `new WebSocket('ws://127.0.0.1:<theia port>/services/...')` and `fetch(...,{credentials:'include'})`; both must be refused. The probe must also run against a deliberately cookie-bearing control (the shell frame) so a refusal is not vacuous.

**Phase to address:** the phase that first shows the Orca web client in a tab.

---

### Pitfall 6: Port collision, unstable origin, and profile locking

**What goes wrong:** orcad's default port is 6768 and it moves to the next free one (6770 in the spike) **[live]**. Consequences:
- The web client keeps its paired device record in the origin's storage. A different port is a different origin, so each launch that lands on a new port loses the pairing and creates another paired-device record in the orcad profile. Records accumulate; stale entries are never revoked.
- A running Orca desktop and a PB-spawned orcad must not share a data root. Locks are per data root (`orcad.lock`, `orcad-instance-lock.ts:44`); orcad also refuses a root that is not private (`orcad-data-root-privacy.ts`: wrong owner, shared, "refuses to start", `chmod 700` needed) and not on a local disk (`orcad-data-root-locality.ts`). A PB profile on a network home or created with a loose umask fails here.
- After a crash the lock is stale; pid reuse and "holder unverifiable" cases exist (`orcad-instance-lock.ts` codes `orcad_instance_lock_holder_unverifiable`, `..._foreign_identity`). A launcher that retries blindly loops.
- `--reclaim-stale-lock` and `--data-root` do not scope `serve` (spike finding 1).
- Two PB profiles running at once must have separate data roots (`powerbrowser-orca` inside each profile directory, not one global directory) or the second one fails.

**How to avoid:** persist the last-used port per PB profile and request it first, with fallback allowed (managed-mode semantics in `orcad-ws-port-policy.ts`: an explicit port without the managed env sets `requirePinnedWsPort`, i.e. fails instead of falling back, so test which mode PB wants). If the port changes, re-pair and revoke the previous device. Create the data root with mode 0700 before spawn. Map every orcad exit code and error code (`orcad_*`, `runtime_serve_already_running`) to PowerBrowser copy with a real next step (`CLAUDE.md` "User-facing copy"); raw codes go only to the diagnostics layer.

**Warning signs:** the Orca tab asks to pair after every PB restart; many device entries in Orca's settings; `orcad_data_root_*` errors on first run on some hosts.

**Check:** live row: start with 6768 occupied by a dummy listener, require orcad to come up on another port and the supervisor to read the port from the ready JSON, never from a constant. Second row: two supervisors with two profile directories coexist. `shell-error-copy-no-internals` must be extended by *deriving* the orcad error-code set from the fetched bundle (`grep -o "orcad_[a-z_]*"`), not from a list.

**Phase to address:** orcad supervisor phase.

---

### Pitfall 7: Keyboard shortcuts: PB's page-scoped browser keys take Orca's terminal and app keys, and four of them cannot be overridden

**What goes wrong:** PB chrome enables its page-key rows whenever the focused element is a web-tab overlay (`powerbrowser.js:419-427` comment; the rows are created disabled and enabled by the focus tracker). The Orca web client is such a page. The rows include Ctrl+T, Ctrl+W, Ctrl+Tab, Ctrl+Shift+Tab, Ctrl+PageUp/PageDown with `reserved: true` (`powerbrowser.js:430-446`), which fire even if the page calls `preventDefault` (`powerbrowser.js:379-391`, the `reserved="true"` mechanism). Non-reserved rows: Ctrl+R, Ctrl+L, Ctrl+F, Ctrl+P, Ctrl+S, Ctrl+U, Ctrl+D, Ctrl+M, Ctrl+Shift+B, Alt+1..9, Alt+Left/Right, F3, F5, F6, F11, F12 (`chrome-bar-shortcuts.ts:46-100`).

Orca's default bindings (`src/shared/keybindings/definitions-core-*.ts`) include Mod+T, Mod+W, Mod+L, Mod+R, Mod+P, Mod+F, Mod+S, Mod+D, Mod+B, Mod+N, Mod+Shift+T, Mod+Shift+R, Mod+Shift+B, Ctrl+Tab, Ctrl+PageUp/PageDown, Alt+1, Alt+ArrowLeft/ArrowRight. On Linux and Windows `Mod` is Ctrl. In the terminal pane, Ctrl+W is "delete word" and Ctrl+R is history search. Result: a user typing in an agent terminal closes the PB tab with Ctrl+W, and tab-switching keys switch PB tabs instead of Orca tabs.

**How to avoid:** a per-tab key policy in the existing focus tracker: when the focused overlay is a `pb-orca:` tab, disable all page-key rows except a small escape set (focus address bar, a PB chord that is not in Orca's table), and document the escape chord in PB copy. This is a chrome change in `powerbrowser/shell/powerbrowser.js` plus `chrome-bar-shortcuts.ts`, so the existing `shortcut-relay` check must be extended and its own rule applies: the rows, labels and reservations are derived from the tree and compared as a set.

**Warning signs:** Ctrl+W in an Orca terminal closes the tab; Orca's own palette keys do nothing.

**Check:** live row, modelled on `verify-nav-keys-live.mjs`: focus the Orca terminal, send Ctrl+W, Ctrl+Tab, Ctrl+R through `input.performActions`, and assert the PB tab count and URL are unchanged and the terminal received the bytes. Static row: derive Orca's `defaultBindings` from the pinned source or bundle at fetch time and fail on any chord that PB's table claims while a `pb-orca:` tab has focus, unless it is in an explicit, reasoned exception list kept next to the derivation (same pattern as `shortcut-relay`'s "reasoned exceptions").

**Phase to address:** Orca mode phase (after the first tab renders).

---

### Pitfall 8: Egress from orcad and from the Orca web client escapes PB's allowlist, and the NG-069 instrument does not see it

**What goes wrong:** strings in the 1.4.245 `orcad-server.js` and the renderer bundle name these non-agent hosts (extracted by regex over the bundle; reachability not traced):
- Telemetry: `us.i.posthog.com`, `eu.i.posthog.com` and their `-assets` hosts, and `sentry.io` (consent logic in `src/main/telemetry/consent.ts:53-56` honours `DO_NOT_TRACK` and `ORCA_TELEMETRY_DISABLED`).
- Orca cloud: `push.onorca.dev` (push gateway; `src/main/runtime/push/push-gateway-origin.ts:4`, override `ORCA_PUSH_GATEWAY_URL`), `login.onorca.dev`, `relay.onorca.dev`, `connector.onorca.dev`, `share.onorca.dev`, `www.onorca.dev/v1/feedback`.
- Content: `storage.googleapis.com` (skill install, `runtime-skill-install-commands.ts:84`), `raw.githubusercontent.com`, `github.com` and `api.github.com` (skills, plugin marketplaces).
- In the web client (runs in a Gecko tab, so it falls under layers 1-3 of `verify-endpoints.sh`): `https://www.google.com/s2/favicons?domain=...` (leaks every linked domain to Google), and a CSP allow list naming `cdn.jsdelivr.net`, `unpkg.com`, `cdnjs.cloudflare.com`, `esm.sh`, `fonts.googleapis.com`, `fonts.gstatic.com`.

NG-069's layer 4 hooks `dns.lookup` through a `NODE_OPTIONS` preload on the **Theia sidecar** only (`verify-ng-069-sidecar-egress.mjs:12-18`). It does not cover: orcad, the `daemon-entry.js` child, native binaries that agents or orcad run (`agent-browser-linux-x64`, `git`, `ssh`, `rg`), or any process started with a scrubbed environment (P-2). Agent traffic to `api.anthropic.com` etc. is user traffic, not PB's, and must be scoped out explicitly or every run goes red.

**How to avoid:**
- Set `DO_NOT_TRACK=1` and `ORCA_TELEMETRY_DISABLED=1` in orcad's environment. Point `ORCA_PUSH_GATEWAY_URL` at a loopback dead end only if the spike confirms push then disables cleanly (survey section 8 lists this as not checked).
- Add `endpoint-allowlist.json` rows: `deny` for PostHog, Sentry and `*.onorca.dev` unattended; `user-initiated` for hosts reachable only after a click (e.g. skill install).
- Extend layer 4 to the orcad process tree: preload via an explicit pass-through of `NODE_OPTIONS` (keep it out of the agent PTY environment, or scope the recording to processes whose executable is the fetched node-runtime and whose script is orcad's), and require an anti-vacuity host (orcad's `--bind` health check does not resolve a name, so the control must be a deliberate lookup by the harness).
- Derive the host set at check time: regex `https?://host` over the fetched `orcad-server.js` plus every web asset, minus a short reasoned ignore list (w3.org, example, docs links), and require each to have an allowlist row. A new Orca release that adds a host then fails the fetch check, not a release.
- Ensure the Gecko-side `www.google.com/s2/favicons` request is either suppressed (injected CSP/`network.http` block via the actor) or listed as `deny`. **[unverified]** whether the web client makes the call in the project views.

**Warning signs:** `verify-endpoints.sh` layer 3 reports an unknown host while the Orca tab is open; DNS logs show `posthog`.

**Phase to address:** orcad supervisor phase (env) and a dedicated "egress" plan inside the Orca mode phase.

---

### Pitfall 9: Credentials unencrypted, or encrypted with a key outside the PB profile

**What goes wrong:** orcad stores credentials unencrypted when (a) the data root is under `tmpdir()`, `/tmp` or `/var/tmp` (`isTemporaryKeyDir`, `orcad-secret-key-record.ts:101`), (b) `ORCA_HEADLESS_SECRET_STORE=plaintext` is set (P-2), (c) the key cannot be unsealed (new credentials are refused, `describeOrcadSealingUnavailable`). Spike 003 hit (a) **[live]**. For a persistent PB-owned profile, orcad seals with a key file in `orcadCredentialRoot()` = `join(homedir(), '.orca')` (`orcad-plaintext-credential-migration.ts:41-44`), **not** inside `ORCA_USER_DATA`. So:
- A PB "isolated" profile still reads and writes the user's real `~/.orca`, shared with Orca desktop, even though `powerbrowser-orca` was chosen to avoid sharing.
- The key sits beside the credentials; "Anyone who can read this account's files on this host, or a backup of them, can unseal them" (`describeOrcadHostKeyGap`). The protection is OS-user isolation only. Do not describe it to users as encryption against local compromise.
- Under Flatpak without home access, `homedir()` is the sandbox home; with `--filesystem=home` it is the real one (P-17).
- PB's own tests and live probes run with temporary profiles under `/tmp`, so they always hit the plaintext path.

**How to avoid:** the "credential-storage check" must be a positive check of what exists, not a log grep: the sealed state file `orcadSecretStatePath` (`orcad-secret-key-resolution.ts:59`) exists in `~/.orca`, and no `*.enc`/token file under the profile is plain. Set `HOME` for orcad only if the owner wants a fully separate key location (it also moves `~/.claude`, `~/.agents` and agent hooks; do not do this without reading P-14). Display the result in PB copy without file names.

**Warning signs:** orcad logs "temporary profile ... stores credentials unencrypted"; key state file missing.

**Check:** the check needs two runs: a control on a `/tmp` data root that **must** show the "unencrypted" signal (proving the signal is emitted by orcad and not by PB's instrumentation; `CLAUDE.md` Verification rule 1), then the persistent-profile run that must not. Prefer the state-file existence assertion as primary and the message as secondary.

**Phase to address:** credential-storage-check phase, with the temp-root pitfall fed back into the supervisor phase.

---

### Pitfall 10: Pinning Orca while Orca ships roughly daily: protocol, profile and agent-integration drift

**What goes wrong:**
- Orca 1.4.214 and 1.4.245 are 31 releases apart in the evidence on this machine; the cadence is high. A pin goes stale fast, and security fixes arrive only through re-pinning.
- The web client and orcad come from one bundle, so they cannot disagree with each other. Drift appears elsewhere: (a) an Orca phone app or desktop paired to PB's orcad (`MIN_COMPATIBLE_RUNTIME_SERVER_VERSION`, `RUNTIME_PROTOCOL_VERSION` in `src/shared/protocol-version.ts`); (b) agent CLIs (Claude Code, Codex) update on their own schedule while orcad's hook and status parsing is frozen at the pin (`ORCA_HOOK_PROTOCOL_VERSION = '1'`, `agent-hook-types.ts:48`; `agent-state-rules-live-update` is imported at `orcad-entry.ts:244`, so some rules may be fetched live, **[unverified]**); (c) the profile written by a newer orcad may not open under an older one, so rolling back a pin after a failed upgrade corrupts or refuses the profile.
- The per-version runtime is materialized into a cache (`orcad-artifact-materializer.ts`, `orcad-artifact-cache-retention.ts`); old versions accumulate on disk, and materialization verifies the template hashes (`orcad-template.json`, schema in `orcad-template-manifest.ts`). Anything that modifies the fetched binaries after the fetch (Nix `autoPatchelfHook` in `nix/pkg/powerbrowser-bin.nix:112`, macOS ad hoc re-signing, Windows signing) changes those hashes, **[unverified]** whether orcad then refuses to start or re-materializes from the unmodified template.

**How to avoid:**
- Put the pin in `configuration.toml` `[upstreams]` next to `firefox_esr_tag` and `theia_release`, emitted into `generated/upstream-pins.env` by `scripts/generate.mjs`, consumed by a `scripts/fetch-orca.sh` modelled on `scripts/fetch-upstream.sh`. One literal, one place.
- Verify integrity from the artifact itself: `orcad-template.json` carries `commonSha256` and `targets.<os>.files` hashes. The fetch script checks the download hash (pin) and then re-derives and compares the template hashes.
- Record the pinned version in the profile (e.g. `powerbrowser-orca/.pb-orca-version`) and refuse to start an older pin against a newer profile with PB copy ("This Orca data was created by a newer PowerBrowser").
- Add the Orca pin to the rebase/refresh workflow (`rebase-upstream.sh`, `detect-upstreams.mjs`) as a *detected-not-applied* upstream so drift is visible.
- Run the spike's `probe.mjs` flow as the pin-bump acceptance test (pairing, workspace list, terminal I/O).

**Warning signs:** agent status stops updating after an agent CLI upgrade; orcad refuses a profile after a pin change; disk growth under the cache root.

**Phase to address:** pin/fetch phase (first), with the profile-version guard in the supervisor phase.

---

## Moderate Pitfalls

### Pitfall 11: JSWindowActor injection: wrong scope, wrong timing, wrong privilege

**What goes wrong:**
- Scope: actor `matches` cannot carry a port (`PowerBrowserAPI.sys.mjs:276-290`). A branding actor registered for `http://127.0.0.1/*` also loads in the Theia frontend, in every user dev server on 127.0.0.1, and in the Orca tab. The existing `PowerBrowserGroup` actor already has this shape and survives only because the parent refuses senders by port (NG-038, `groupSenderPort`).
- Timing and fragility: the bundle has 1,031 assets with content-hashed names (`assets/App-DC4S-gZy.js`, `assets/web-5pB048xX.js`) and no stable `data-testid` hooks in the renderer chunks (zero found). Class names are Tailwind/shadcn utilities. A stylesheet keyed on a class or a text node breaks silently on the next release, and React re-renders replace DOM nodes that a one-shot DOM edit touched. Settings seeded into `localStorage` before first paint can be overwritten by the app; the keys (survey section 6 "localStorage keys") change without notice.
- Privilege: decision 4 widens the "no DOM write" privilege row; the new row must be in `INTERNAL-APIS.md` and pass `check-internals-boundary.sh --catalogue`.
- Cache: edits to `powerbrowser/shell/*.js` do not run without `-purgecaches` (chrome JS startup cache; memory "Chrome JS startup cache"). `scripts/lib/pb-live-probe.mjs:5,46` sets `MOZ_PURGE_CACHES=1`, so harness runs are safe; a hand run of `objdir/dist/bin/powerbrowser` is not.

**How to avoid:** the actor child checks `document.location.port` against a port the parent passes in per window, and does nothing otherwise; the parent refuses messages from any other sender (copy the NG-038 pattern, do not invent another). Use `windowUtils.loadSheet` with CSS that targets only CSS custom properties and `:root` tokens (`--background`, `--primary`; `main.css:57-94` in the survey) where possible, plus a small number of attribute selectors, and treat each as a known-fragile selector with a label. Keep the injection list in one table.

**Warning signs:** the PB logo reappears with the Orca logo after a pin bump; the Theia frontend picks up Orca styling; edits to the actor do nothing.

**Check:** (a) live: after a pin bump, a probe asserts each injected selector still matches at least one element (the "injection manifest" check), and fails naming the stale selector; (b) live negative control: the Theia frame and a second `127.0.0.1` page on another port have no injected sheet; (c) the actor child exports a build stamp the probe reads, so a stale cached script is detected rather than silently tested.

**Phase to address:** branding-injection phase.

---

### Pitfall 12: Brand-residue scan and licence handling over the fetched Orca tree

**What goes wrong:**
- The residue scan iterates `git ls-files` (`CLAUDE.md`). The fetched Orca tree must be untracked and ignored like `upstream/` (`.gitignore:33`), or it is scanned. I grepped the installed 1.4.245 `app.asar.unpacked` for the originating-product token: zero hits, so a tracked copy would pass today, but a tracked 108 MB tree is the wrong design and a future Orca string could trip the raw-substring probe. Conversely, an unstaged new PB file mentioning the product is invisible; stage before trusting a green scan.
- Licences: Orca itself is MIT, Copyright 2026 Lovecast Inc. (`orca-eval/LICENSE`). My scan of `resources/node_modules` and `orcad-template/node_modules`: MIT 55, ISC 11, BSD-3 2, Apache-2.0 2, BlueOak 1, Unlicense 1, Python-2.0 1, none GPL/LGPL/AGPL. The exceptions: `@anthropic-ai/claude-agent-sdk@0.3.284` declares "SEE LICENSE IN README.md" and the README points to Anthropic's Commercial Terms (not an open-source licence, redistribution terms need a ruling); `@orca/process-host@0.0.0` declares none (Orca's own workspace package). `orcad-server.js` is a single 12 MB bundle, so the `node_modules` list under-reports what is inlined (only 2 `@license`/`Copyright` markers in the file); a licence inventory must also come from the bundle's source (Orca's lockfile at the pinned tag). `resources/node-runtime/` contains only `bin/node`: no Node `LICENSE`, and the Node binary carries its own third-party notices (ICU, OpenSSL, etc.). Other native pieces: `agent-browser-<os>`, `ripgrep` (has `licenses/`), `computer-use-*`, `relay`, `node-pty`, `@parcel/watcher`.
- Trademark: a third party has a pending USPTO ORCA application in Classes 9/42 (survey section 7 item 11, from aggregator sites, not USPTO). Owner decision 1 keeps "Orca" as the mode name; this stays a legal-review item, not an engineering one.

**How to avoid:** fetch into an ignored directory (e.g. `orca/` next to `upstream/`), generate `THIRD-PARTY` notices through the existing `scripts/generate-licensing.mjs` path from the fetched tree, and make the fetch step fail on any SPDX id outside an allow-list or on "NONE"/"SEE LICENSE" unless a ruling is recorded. Ship Node's `LICENSE` with the runtime (take it from the Node release the Orca team used; confirm version with `node-runtime/bin/node --version`). Get a ruling on the Claude Agent SDK terms before the first installer includes it.

**Check:** `--quick` row `orca-licence-inventory` derived from the fetched tree: counts per SPDX id, fails on non-allow-listed. `scan-brand-residue.mjs` stays untouched; add an assertion that `git ls-files` contains no path under the fetch directory.

**Phase to address:** pin/fetch phase; legal ruling before the first release.

---

### Pitfall 13: Per-OS runtime differences

**What goes wrong:**
- **NixOS / non-FHS Linux:** the fetched `node-runtime/bin/node`, `node-pty` `pty.node`, `agent-browser-linux-x64` and `ripgrep` are generic Linux ELF files with `/lib64/ld-linux-x86-64.so.2` as interpreter. They do not start on NixOS outside an FHS environment (survey section 8: "Whether /lib64 exists on the host outside the Orca FHS env; this session runs inside it"; the spike ran inside `orca-ide-<ver>-fhsenv`). The PB package already uses `autoPatchelfHook` for its tarball node (`nix/pkg/powerbrowser-bin.nix:112-131`), but patching changes hashes (P-10). Template targets exist for `linux-x64-glibc`, `linux-x64-glibc217`, `linux-x64-musl` and arm64 variants (`orcad-template.json`): choose the target by a real libc probe.
- **macOS:** the project does not sign or notarize (memory "No official store publishing"). On Apple Silicon every arm64 Mach-O needs at least an ad hoc signature, or the kernel kills it; a PB bundle downloaded by a browser carries `com.apple.quarantine`, and nested unsigned executables spawned from the app can be blocked or killed by Gatekeeper without a prompt. Orca's binaries arrive signed by Orca's team id; re-signing for the PB bundle changes hashes (P-10). **[unverified]**, needs a macOS runner or a manual item.
- **Windows:** Defender real-time scanning delays first launch of `node.exe`, `pty.node` and ConPTY components, so a startup timeout tuned on Linux fails on first run; deep `node_modules` paths (for example `orcad-template/node_modules/@parcel/...`) risk `MAX_PATH`; the leftover-process reap is Linux-only (P-4); the profile directory ACL logic exists in orcad (`restrictWindowsPathSync` import in `orcad-data-root-privacy.ts`), so PB must not pre-create the directory with inheriting ACLs. **[unverified]**.
- **Agent tooling:** Claude Code et al. are not part of the fetch. orcad finds them through its own PATH list (spike: FHS tools, `~/.local/bin`, volta, asdf, fnm, mise, homebrew, snap, ...); a GUI-launched PB on macOS has a minimal PATH (`ORCA_DISABLE_MACOS_LOGIN_SHELL` exists as a variable, so Orca has a login-shell step on macOS, **[unverified]** how it behaves from a PB-spawned orcad).

**How to avoid:** put the target choice, the post-fetch transformation (patchelf, ad hoc sign, Authenticode) and the hash re-check in one script with one table per OS. Make the startup timeout a measured value per OS with a first-run allowance. Treat each OS as a separate acceptance row; Linux ships alone (memory "Windows sign never blocks Linux").

**Warning signs:** `Killed: 9` or "cannot execute binary file" on first spawn; orcad "not ready" only on the first run after install.

**Phase to address:** per-OS packaging phase, with a Linux/Nix patch-hash spike early because it constrains P-10.

---

### Pitfall 14: orcad writes outside the PB profile (hooks, skills, `~/.orca`) and survives uninstall

**What goes wrong:** agent status hooks edit the user's real `~/.claude/settings.json` and sibling agent config files (survey section 7 item 9, `ORCA_CLAUDE_AGENT_STATUS_SETTINGS`); bundled skills install under `~/.agents/skills`; the sealing key sits in `~/.orca` (P-9); worktrees default to `~/orca/workspaces`. The owner chose to leave status hooks on. Consequences: entries are shared with Orca desktop and keep pointing at a hook port or command that no longer exists when PB is closed; uninstalling PB leaves them; whether skills auto-install on first start and whether hook entries go to the real `~/.claude/settings.json` or an Orca-managed profile is listed as not checked (survey section 8).

**How to avoid:** inventory every path orcad writes with a spike run under `strace -f -e trace=openat,mkdir,rename` (or Procmon / `fs_usage`) on a clean `$HOME` and record it as the derived "write surface"; compare to it on pin bumps. PB's Add-project and "Reset Orca" features must say in PB copy what stays behind. Do not touch the Flatpak `finish-args` allow-list silently (P-17).

**Check:** derive-and-compare row: run orcad under a fresh `HOME` in the live harness, list files created outside `ORCA_USER_DATA`, and compare as a set to a committed fixture generated from a previous run; goes red on additions and removals (`CLAUDE.md` rule 2), with a self-test that plants a stray write.

**Phase to address:** orcad supervisor phase; recorded again in the Add-project phase.

---

### Pitfall 15: Nested split layout: Orca's splits inside one PB tab versus the Lumino dock

**What goes wrong:** the web client is the desktop renderer with its own tab groups and split layout (`TabGroupSplitLayout`, `TabGroupSplitNodeTree`, dnd-kit; confirmed `TabGroupSplit` in `renderer/assets/App-*.js`). Inside a `pb-orca:` tab the user gets Orca tabs and splits that PB's Lumino `DockPanel` cannot see, drag into or out of. "Orca tabs move between any modes" is satisfiable only for the whole client, unless Orca views become individual PB tabs, which needs a way to show one view. The client has no URL router (`orca-client-hosting.md`, Constraints), and the only files orcad serves are `/web-index.html` and the `/assets/`, `/cmaps/`, `/standard_fonts/`, `/wasm/` prefixes (`static-web-client-handler.ts:7-8`), so `popout.html`/`space.html` (which exist in `out/renderer`) return 404 in the web build.

Other consequences:
- Two PB tabs on the same Orca origin are two clients sharing `localStorage` (layout, settings). They overwrite each other's persisted layout **[unverified]** which keys.
- A web-tab overlay is a chrome-owned `<xul:browser>` that "cannot follow a widget into a dependent window" (`web-tab.ts` header, UI-SPEC A12). Moving an Orca tab to a dependent window is therefore not possible; moving between modes inside the shell window must not reload the page, or the terminal reconnects and Orca's in-memory state is lost.
- Orca's own tab bar and PB's tab strip duplicate each other; two sets of "new tab", "close", "reorder" for the same thing.
- The GUI-04 bridge rule still applies: nothing may weld Theia to full-window presentation.

**How to avoid:** decide once, in the spec, that an Orca tab is the whole client (one per orcad, enforced: opening `pb-orca:` again activates the existing one, like `view:` handlers do, `docs/URI-SCHEMES.md` "open-versus-focus"). Defer per-view tabs until the browser-replacement work shows how Orca views can be addressed. State the degraded cases in `docs/URI-SCHEMES.md` as documented trade-offs, which is the existing convention ("the four cases that genuinely degrade").

**Check:** live row: move the `pb-orca:` tab between modes via the modes API and assert the page's `performance.timeOrigin` is unchanged (no reload) and the terminal still echoes. A `--quick` row asserts `TabUriRegistry`'s exported shape is unchanged (`verify-registry-shape.mjs` already does).

**Phase to address:** `pb-orca:` tab phase.

---

### Pitfall 16: Replacing Orca's Chromium browser with PB tabs: CDP-versus-BiDi gaps, and a new remote-control surface

**What goes wrong:** Orca's agent browser automation is CDP. Counting `'Domain.method'` literals under `src/main`, `src/cli`, `src/shared`: `Runtime.evaluate` (62), `Input.dispatchMouseEvent` (45), `DOM.focus` (43), `Emulation.setUserAgentOverride` (42), `Input.insertText` (41), `Page.captureScreenshot` (35), `Input.dispatchKeyEvent` (33), `Page.screencastFrame` (22), `Emulation.setTouchEmulationEnabled` (20), `Emulation.setDeviceMetricsOverride` (17), `Network.getAllCookies` (16), `Accessibility.getFullAXTree` (10), `Page.printToPDF` (9), `Target.*`, `Fetch.*`, `IO.*`, and others. The native `agent-browser` binary speaks CDP over a WebSocket. Gecko removed CDP (**[unverified]** exact release; check Firefox release notes for the ESR 153 line).

Rough mapping to WebDriver BiDi, from general knowledge of the spec, **[unverified]** for Firefox ESR 153 module by module: covered or close: navigate, reload, screenshot (`browsingContext.captureScreenshot`), print (`browsingContext.print`), script evaluate/call, preload scripts (replaces `addScriptToEvaluateOnNewDocument`), console/log events, cookies (`storage.*`), file input (`input.setFiles`), network intercept/events, viewport and basic emulation. Likely gaps: screencast frames (22 uses; the live-view feature), `Accessibility.getFullAXTree` (agent snapshots), `Input.insertText` and IME composition (use key actions instead), `Emulation.setFocusEmulationEnabled`/touch/device metrics (partial), `DOM.*` node-id operations (BiDi uses shared references), file-chooser interception, `Browser.getVersion`.

Second problem: using BiDi from orcad means PB must expose the Remote Agent on a port in a shipping build. BiDi has no authentication. Any local process could then drive the browser, evaluate script in chrome-privileged contexts if Marionette is also on, and read cookies, including the HttpOnly PB token cookie (P-5), via `storage.getCookies`. No `remote.*` pref or `--remote-debugging-port` handling exists in the tree today (`grep` over `mozconfig*`, `powerbrowser/distribution`, `configuration.toml`, `patches` found none); the harness passes the flag per launch.

**How to avoid:** keep the spike's own rule: inventory first, then design. Rank each CDP method by which caller uses it (agent CLI, renderer, orcad), and mark "impossible in Gecko" explicitly. Prefer an in-process provider (chrome actor plus PowerBrowserAPI) over a listening debug port; if a port is unavoidable, bind loopback, pick a random port per launch, and require a per-launch secret in the connection (Remote Agent has none, so a proxy in the supervisor must add it). Expose only the tab ids the user has granted to Orca. Decide where the provider lives (upstream Orca contribution versus a PB-side module orcad loads) before writing code; the seed prefers upstream, and a PB-side module that orcad loads conflicts with "never patch Orca" unless it uses a documented seam.

**Warning signs:** an agent `orca browser` command opens a separate Chromium or fails after the swap; screenshots work but accessibility snapshots return empty.

**Check:** a feature-parity matrix generated from the CDP method list (derive: regex the pinned source for `'Domain.method'` literals, join to a committed status table, fail when a method appears that has no row; self-test plants a new method). Live row: a port scan from a second process against the PB process tree must find no unauthenticated debug listener in a release-configured launch.

**Phase to address:** the browser-parity spike; the build phase only after the matrix has no unowned rows.

---

### Pitfall 17: Flatpak with `--filesystem=home`: the sandbox does not contain tools, and the allow-list check will go red

**What goes wrong:**
- `scripts/verify-flathub-manifest.mjs` enforces `finish-args` equal to a hand-kept allow-list "and no filesystem or bus-name grant" (lines 15-17, 72, 160-164). Adding `--filesystem=home` fails it. The allow-list is a policy kept by hand (the file says so), so changing it is a deliberate edit with its own self-test fault, and Flathub review will question the grant.
- The runtime `org.freedesktop.Platform` has no `git`, `ssh`, `gh`, `node` for agents, and agents' binaries in `~/.local/bin` rely on host libraries that the runtime may lack. Agents and `git worktree` fail inside the sandbox even when files are reachable. Running host tools would need `--talk-name=org.freedesktop.Flatpak` and `flatpak-spawn --host`, which defeats the sandbox and is a second policy change.
- `$XDG_CONFIG_HOME`/`$XDG_DATA_HOME` inside the sandbox point under `~/.var/app/org.debios.PowerBrowser/`, while Orca's CLI scripts compute `${XDG_CONFIG_HOME:-$HOME/.config}/orca` (`bundled-skill-guides.ts:1826`): the CLI and orcad can disagree on the directory.
- `--filesystem=home` exposes `~/.ssh`, `~/.aws`, browser profiles and every credential file to Orca's agents running with permissions skipped. This is the user's choice but must be stated in PB copy at the first launch of Orca mode.

**How to avoid:** make the Flatpak Orca support an explicit, reduced claim: agents are expected to be host-installed tools reachable under home, and `git` etc. are supplied by an additional runtime extension or bundled in `/app`; test the actual agent run (as spike check 4 did) inside the Flatpak build, not only on the host. Update `SANDBOX_ALLOW`, its fault list and the Flathub submission text together.

**Check:** `verify-flathub-manifest.mjs --self-test` must still plant and catch a stray grant after the allow-list change. Live (Flatpak CI job): spawn an agent shell, run `git --version`, `claude --version`, `ls ~/` and assert exit 0.

**Phase to address:** per-OS packaging phase.

---

### Pitfall 18: Add-project UI registers paths the user did not intend, or fails silently

**What goes wrong:** `--project-root` does not register a project; the client shows "No workspaces found" until `orca repo add --path` (spike finding 6). The Add-project UI in PB (a Theia dialog, not Orca's) must call the same RPC. Pitfalls: a folder path chosen in PB reaches orcad as an absolute path that under Flatpak means a different thing inside versus outside; a path with spaces or `~`; a non-git directory (the CLI errors); a path inside the PB profile or `upstream/`; a path that is the home directory (Orca will scan it); the Add-project call needs `ORCA_USER_DATA_PATH` set (P-1 correction) or it registers into the desktop profile; raw CLI stderr surfaces as user-visible text (`CLAUDE.md` copy rule). The spike never exercised Add project in the web client UI.

**How to avoid:** call orcad's RPC over the already-paired channel, or the CLI with the exact PB environment from P-2; validate the path as a git working tree with the PB side before the call; map outcomes to PB copy with a next step; show the project list from orcad, not a PB copy.

**Check:** live row with a throwaway repo, a non-git directory, a path with a space, and a path that is already registered; each outcome checked against the copy table (a table-derived check like `verify-shell-error-copy.mjs`).

**Phase to address:** Add-project phase.

---

## Minor Pitfalls

### Pitfall 19: Agent defaults are a product decision, and the web tab makes them reachable from any page that holds the offer
A fresh profile launches Claude with `--dangerously-skip-permissions` (spike finding 5; owner kept the default). Combined with P-1 and P-5 the blast radius of any leak is arbitrary command execution as the user. Show the one-time notice in PB copy, record the decision in the Orca mode spec, and keep the permission default out of the injection (a setting seeded by the actor is fragile). **Phase:** Orca mode phase.

### Pitfall 20: Matching the Orca tab by exact URL
The client strips `#pairing=...`; match on origin and the `pb-orca:` identity (spike). The chrome-side `WebTabOpenHandler` and the tab-store row must not key on the full URL either, or each reload creates a second row. **Phase:** `pb-orca:` tab phase.

### Pitfall 21: `ORCA_*` / profile name differences between CLI and orcad
See correction 1: set both `ORCA_USER_DATA` and `ORCA_USER_DATA_PATH`, or the Add-project CLI call and orcad use different profiles. **Phase:** supervisor phase.

### Pitfall 22: Verification rules from `CLAUDE.md` applied to the new checks
- Never assert on the absence of a log line unless the emitter is proven to be the code under test. Affects: "no unencrypted warning" (P-9), "no network exposure warning" (P-3), "no pairing in logs" (P-1). Each needs a positive assertion or a control run that proves the emitter works.
- Derive from the tree and compare as set equality; give every new check a `--self-test` that plants faults. Affects: ORCA_* poison set (P-2), egress hosts (P-8), orcad error-code copy table (P-6), write-surface (P-14), CDP method matrix (P-16), Orca key table (P-7).
- Adding a check means appending one row to `scripts/verify-platform.sh`, not creating a driver. Every row below that is purely static goes in `--quick`.
- No internal identifier in user-facing copy: ports, `orcad_*` codes, `ORCA_*` names, `~/.orca`, "headless server", "pairing" must not appear; use "PowerBrowser" and a real next step. The mode and tab are named "Orca" by owner decision, so the word "Orca" is allowed; a raw orcad message ("Orca's headless server ...") is not.
- Chrome JS startup cache: edit-and-hand-run without `-purgecaches` silently runs old code. Harness runs purge.
- Patches regenerate, never text-edit: any new patch for chrome key policy (P-7) or BiDi exposure (P-16) follows `regenerate-patches.sh`; `check-patch-surface.sh` guards it.
- No generator rule from Phase 1 is superseded by Phase 2: pins go through `configuration.toml` and `generate.mjs`, not a literal in several files.

---

## Phase-Specific Warnings

Phase names are proposed here for the roadmap; the roadmapper may rename them.

| Phase topic | Likely pitfall | Mitigation |
|---|---|---|
| Pin and fetch Orca per OS | P-10 hash drift after patching; P-12 licence and tracked-tree; P-13 target choice | Pin in `configuration.toml`; fetch into an ignored directory; verify against `orcad-template.json`; licence allow-list row |
| orcad supervisor | P-1 offer handling; P-2 env scrub; P-3 bind; P-4 orphans; P-6 port and lock; P-14 write surface | New scrubbing spawn method (catalogued); typed ready-line parser; state file with pid and start ticks; managed-stop investigation |
| `pb-orca:` tab and Orca mode | P-5 cookie and origin; P-7 keys; P-15 nested splits; P-20 URL matching; P-19 agent default | Origin check in token gate; per-tab key policy; whole-client definition; one tab per orcad |
| Branding injection | P-11 actor scope and fragility | Port-gated actor; injection manifest check; build stamp |
| Egress | P-8 | Env flags; allowlist rows; layer 4 extended to orcad; derived host list |
| Credential-storage check | P-9 | State-file existence plus a plaintext control run |
| Add-project UI | P-18; P-21 | Same environment as orcad; validated path; copy table |
| Browser parity spike | P-16 | CDP method matrix with owners; in-process provider preferred |
| Browser provider build | P-16, P-5 | Authenticated, loopback, per-tab grants |
| Packaging (macOS, Windows, Flatpak, Nix) | P-13, P-17, P-4 | Per-OS table; Flatpak allow-list change with self-test; Linux ships alone |

## Research flags for the roadmap

- Needs its own research or spike before planning: P-4 (managed stop and idle exit usable by a third-party launcher), P-5 (cross-origin WebSocket to the sidecar), P-10 (does orcad accept binaries patched after the fetch), P-16 (BiDi coverage on the pinned Firefox, provider location).
- Standard patterns, unlikely to need research: P-3 (loopback bind assertion), P-8 env flags, P-12 licence inventory, P-18.
- Needs a macOS and a Windows host (or explicit manual items) and cannot be closed on Linux: P-13 macOS and Windows parts, P-4 Windows part.

## Unverified items to close early

1. Whether Places or sessionstore keeps the `#pairing=` fragment form after the client strips it (P-1).
2. Whether orcad accepts `Host: localhost` and a `localhost` page origin (P-5).
3. Whether orcad has any parent-death handling (P-4).
4. Whether orcad regenerates the pairing offer per start and whether an offer can be revoked (P-1, P-6).
5. Which web-client `localStorage` keys carry layout (P-15) and settings (P-11).
6. Which paths orcad writes outside `ORCA_USER_DATA` on a clean `HOME` (P-14).
7. Whether the web client calls Google's favicon service in project views (P-8).

## Sources

- PB tree files listed at the top (read in this session; HIGH for what the code does).
- Orca source `src/main/orcad/*`, `src/cli/runtime/*`, `src/shared/keybindings/*`, `src/main/telemetry/consent.ts`, `src/main/runtime/rpc/static-web-client-handler.ts` (HIGH for presence; line numbers are 1.4.214).
- Orca 1.4.245 bundle: host strings, asset layout, licence scan of `node_modules` (HIGH for the build on this machine; not run).
- Spike 003 results (HIGH for what ran: Linux/NixOS only, orcad via `orca serve`).
- General platform knowledge (Gatekeeper, Defender, Flatpak runtime contents, WebDriver BiDi coverage): MEDIUM/LOW, marked **[unverified]** where used.
