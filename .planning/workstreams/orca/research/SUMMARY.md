# Project Research Summary

**Project:** Power Browser v1.7 Orca integration (workstream `orca`)
**Domain:** hosting a pinned, unmodified Orca runtime (orcad) and its web client inside a Gecko + Theia platform, then replacing Orca's embedded Chromium browser with PB web tabs
**Researched:** 2026-11-04
**Confidence:** MEDIUM-HIGH (Linux launch contract HIGH; macOS and Windows MEDIUM; Gecko browser-provider mapping MEDIUM-LOW)

Inputs: INPUTS.md (binding owner decisions; they win over any researcher recommendation), STACK.md, FEATURES.md, ARCHITECTURE.md, PITFALLS.md, ../NOTE-orca-tab-parity-direction.md. Citations are the researchers' own. "Orca source" is /home/chris/coding/orca-eval (HEAD 3052dd79, 1.4.214). "Installed build" is Orca 1.4.245. "Gecko tree" is upstream/ at 153.5.1esr.

> Written by the orchestrator from the synthesizer's inline return: a hook refused the synthesizer's file write (#222 self-heal path). Content is the synthesizer's; the Sources list is condensed.

## Executive Summary

v1.7 adds a second token-gated loopback sidecar to PB. PB fetches a pinned Orca release per OS, runs orcad (Orca's headless runtime) under a PB-owned supervisor, and opens Orca's stock web client in one PB web tab addressed `pb-orca:`. Spike 003 validated the shape on Linux. The integration surface is small and fits the hard rules: no new Gecko patches and no Theia core edits for the hosting work. New Firefox touchpoints go through `PowerBrowserAPI.sys.mjs` with catalogue rows. The tab address goes through one optional `WebTabOptions.address` field, so `verify-registry-shape.mjs` stays green. Branding is a literal-valued JSWindowActor plus a stylesheet (no generator).

There are two tracks with very different risk:

- **Hosting track:** fetch, launch, supervise, tab, mode, injection, Add project and the credential check. It is well understood and mostly verifiable on Linux.
- **Browser-replacement track:** Orca agents drive PB web tabs. It is unresolved.
  - Firefox 153 has no CDP: `upstream/remote/` has only `webdriver-bidi/` and `marionette/`.
  - Orca's driver `agent-browser` 0.39.4 is CDP-only.
  - orcad's provider selection is a closed function (`orcad-browser-provider.ts:166-262`, `kind: 'electron' | 'chromium'`).
  - A Gecko provider therefore needs an upstream Orca change or a client-host seam. The researchers disagree on the client-host seam (see Research Disagreements).
  - The browser-parity spike and the upstream Orca conversation must start in the first phases.

Top risks, in order:
1. The pairing URL is a reusable bearer credential for a runtime that runs agents with skip-permissions on. Unless the tab opens on a clean URL and the actor delivers the offer, it leaks through PB's tab store, session restore, Places and logs.
2. The terminal daemon and agent sessions outlive orcad by design, and orcad ignores stdin EOF. PB needs its own supervision, reaping, and an owner-decided quit policy.
3. The Orca page shares the `127.0.0.1` cookie jar with PB's Theia sidecar.
4. PB's reserved page keys (Ctrl+W, Ctrl+T, Ctrl+Tab) take over Orca's terminal keys.
5. Pin drift: Orca ships roughly every day.

## Corrections the Research Made to INPUTS.md

1. **Profile variable: set both.** INPUTS.md says orcad reads `ORCA_USER_DATA` and that spike 003 was wrong to say `ORCA_USER_DATA_PATH`. In fact both names are right, for different programs.
   - orcad reads `ORCA_USER_DATA` (`src/main/orcad/orcad-app-paths.ts:15`, `src/cli/runtime/serve-orcad-launch.ts:83`).
   - The Orca CLI reads `ORCA_USER_DATA_PATH` (`src/cli/runtime/launch-user-data-path.ts:12`, `metadata.ts:46`).
   - STACK proved the consequence [RAN]: an `orca repo add` call with only `ORCA_USER_DATA` set reached the user's running Orca desktop instead of PB's orcad.
   - Every process PB starts from the slot (orcad, and the slot CLI used by Add project) must get both variables, pointing at the same `powerbrowser-orca` directory.
   - A PB started from an Orca terminal also inherits about 12 `ORCA_*` variables, which the supervisor must strip first (PITFALLS P-2, P-21).
2. **The served client is `out/renderer`.** It is the desktop renderer built in web mode, at `app.asar.unpacked/out/renderer/web-index.html` (1295 files). `out/mobile-web` is the phone app and is not served. The bundle contains Orca's `TabGroupSplit` code, so the nested-split limitation applies (P-15).
3. **orcad needs its own Node.** This is not in INPUTS.md. orcad exits 78 on any Node other than 24.22.1 at an exact relative path, and only the Linux AppImage ships one (STACK 0.2, 0.3, section 2). PB's Theia Node is 24.19.0.
4. **"Orca desktop need not be installed" has a catch.** If Orca desktop is installed, orcad starts it as a hidden `--serve` Electron browser engine (`orcad-browser-provider.ts`, STACK 4.1).
5. **BiDi as a transport.** The direction note treats BiDi as a candidate, but it is single-session, unauthenticated, and has no accessibility-tree dump (see Research Disagreements).

## Key Findings

### Recommended Stack

One Orca artifact per OS is enough. `orcad.js`, `orcad-server.js`, `daemon-entry.js`, the renderer files and the `commonSha256` map are byte-identical in the 1.4.248 deb, mac zip and Windows installer [RAN: sha256 compare]. Only the signed native add-ons differ, so fetch each OS's own artifact. Orca is a pinned upstream and is never patched or vendored.

**Core technologies:**
- **Orca release artifacts per OS:** v1.4.248 recommended, v1.4.245 as the fallback.
  - They supply orcad, the web client (`out/renderer`), the natives and the slot CLI (`out/cli/index.js`).
  - Pin them in `configuration.toml`, fetch them into an ignored directory, and verify them against `orcad-template.json`.
- **Node 24.22.1 exactly**, shipped as its own file in the slot (`orcad-bundled-runtime.ts:63-76`). Hashes per target are in STACK section 2. Ship it separately (about 94-127 MB per OS) and leave PB's Theia Node alone.
- **orcad launch:** `--bind 127.0.0.1 --port <pinned> --json --web-client-root <dir>`.
  - The ready JSON line carries `boundEndpoint`, `pairing.webClientUrl` and `runtimeId`.
  - The slot `.version` must equal a sha256 over the slot files, or orcad exits 78 [RAN]. Never restart in a loop on exit 78.
- **The slot CLI** (`repo add --path … --json`) for Add project, with both profile variables set.
- **A JSWindowActor pair** plus `windowUtils.loadSheetUsingURIString` (`nsIDOMWindowUtils.idl:1725-1763`), for brand injection and seeding settings.
  - Register it only inside `registerGroupActor` (`PowerBrowserAPI.sys.mjs:2256-2282`).
  - `matches` ignores ports, so the child must check `location.port`.
- **WebDriver BiDi** (`scripts/lib/firefox-bidi.mjs`), for tests and the spike only.
- **Environment:** set `ORCA_TELEMETRY_DISABLED=1` and `DO_NOT_TRACK=1`, and strip inherited `ORCA_*` and `ELECTRON_RUN_AS_NODE`.

Facts that shape the design:
- orcad ignores stdin EOF (still running 30 s later) and exits on SIGTERM [RAN].
- `--port 0` works, but a port that changes drops all `orca.web.*` localStorage. Pin the port and fail visibly. What orcad does when an explicit port is busy has not been read.
- A persistent profile seals credentials with a key file at `~/.orca/orcad-secret-store-<machine tag>.json`, which is outside the profile. A profile under a temp root stores them unencrypted. The check reads `<profile>/orca-secret-protection.json`.
- `web-index.html` has no CSP [RAN].

### Expected Features

The Orca browser inventory covers 80 CLI specs, 83 `RuntimeBrowserCommands` members, 65 client-host automation methods and 83 CDP method names. The stock web client has no working browser tab. A PB-spawned orcad has no browser provider unless one is added.

**Must have:**
- T-1 Orca mode.
- T-2 orcad lifecycle: pinned fetch, spawn, and teardown including the daemon.
- T-3 auto-pair into a web tab, with the credential kept out of history, restore and logs.
- T-4 `pb-orca:` URI, with the registry shape unchanged.
- T-5 the tab is present in every mode and can be organised.
- T-6 failure UX in PB copy.
- T-7 Add project.
- T-8 credential check.
- T-9 no dead Orca browser entry points.
- T-10 pairing and agent defaults.
- T-11 injection through a JSWindowActor.
- T-12 Linux, macOS and Windows.

**Should have (gated by the spike):**
- D-1 agents drive PB web tabs. Tier 1 is snapshot, screenshot, navigate, click, fill, type and eval.
- D-2 an agent-activity mark and a stop control in the chrome bar, shipped with D-1.
- Then D-3 grab/annotate and D-4 markup.

**Defer (v2+):**
- D-5 native folder picker.
- D-6 dev-server tiles.
- D-7 one Organising row per terminal.
- D-8 a terminal as its own PB tab.
- D-9 a shared browsing profile.
- Tier 3 browser items.
- Per-view Orca tabs, which need an upstream second web entry page.

**What an Orca tab is:** the whole client in one PB web tab, one per orcad (FEATURES B.2 and ARCHITECTURE Q4 agree).
- Pages that Orca agents open are separate PB web tabs, tied to a `browserPageId` by a PB-side table.
- Orca panes cannot be dragged into the Lumino dock, and PB tabs cannot be dragged into Orca's splits. This must be documented.

### Architecture Approach

New and changed components:
- **`powerbrowser/shell/OrcaService.sys.mjs`** (new): consumes only `PowerBrowserAPI.sys.mjs` and starts lazily.
- **PB-owned Node supervisor** (`powerbrowser/orca/orca-supervisor.mjs`, new): sits between chrome and orcad. It supplies a parent-death watchdog, a scrubbed environment, a filter that removes the pairing line, and a graceful stop that works on every OS.
- **`TheiaService`**: not refactored.
- **`pb-orca:`**: an alias carried by a normal web tab. It adds one optional `address` field to `WebTabOptions` and changes one expression in `TabUriRegistry.uriOf`. No export is added.
- **Pairing:** the tab opens on the clean URL `http://127.0.0.1:<pinned-port>/web-index.html`, and the `PowerBrowserOrca` actor delivers the offer after the document is created. The offer stays in chrome memory. The ready line is parsed in a handler that bypasses `_pushLog` and `PowerBrowserAPI.log`.

**Major components:**
1. **OrcaService and the supervisor:**
   - a scrubbing spawn, which is a new catalogued method because `spawnProcess` cannot remove variables;
   - parsing the ready line and asserting `127.0.0.1`;
   - a state file with the pid and start ticks;
   - quit hooks and diagnostics rows.
2. **`PbOrcaOpenHandler` and the `address` option**, with `docs/URI-SCHEMES.md` updated.
3. **The `orca` mode descriptor**, appended to `SHIPPED_MODES` (seven consumers) and to `ChromeBarWidget.MODES`.
4. **The `PowerBrowserOrca` JSWindowActor:** the logo swap, settings seed, pairing delivery and port check.
5. **The Add-project UI and the `orcaAddProject` request.**
6. **The browser-replacement bridge, gated by the spike:**
   - Command path: orcad's forwarding provider, a Unix socket or named pipe in the `0700` data root, the supervisor, stdio JSON lines, OrcaService, then actor messages to the target tab.
   - `browserTabCreate` opens a PB web tab through the existing `webTabOpen` path.
   - The chrome bar gets an agent-control indicator and a stop control.

Patterns to follow:
- Literals only, no generator.
- Stage new files before the brand scan.
- "Orca" is classified only in `inventory/brand-tokens.json`.
- Every new check gets a `--self-test` that plants faults and derives its expectation from the tree.

### Critical Pitfalls

1. **The pairing URL is a bearer credential (P-1).**
   - One offer paired three fresh profiles [live].
   - It would land in `tabs.sqlite`, sessionstore, `web-tab-histories.json`, Places, chrome-bar suggestions, named setups, the address pill and logs.
   - Prevention: a clean URL, delivery by the actor, the offer held only in chrome memory, and containment checks that include a grep of the profile.
2. **Inherited `ORCA_*` environment (P-2).** `spawnProcess` cannot remove variables. Use a scrubbing spawn with an allowlist.
3. **orcad reachable beyond loopback (P-3).** Pass `--bind 127.0.0.1` and assert that `boundEndpoint` starts with `ws://127.0.0.1:`. Never use `orca serve`, which defaults to `--bind 0.0.0.0`.
4. **Orphaned daemon and agent sessions (P-4).**
   - They outlive orcad by design [live], and the existing reap is Linux-only (`signalBarePid`).
   - Decide the policy first. The researchers recommend stopping on quit, with a notice when sessions are live.
   - Use a state file, test quit, crash and kill, and give Windows its own stop path.
5. **Shared cookie jar (P-5).**
   - The token cookie is on host `127.0.0.1`, and cookies are not scoped by port.
   - Orca page JavaScript can open a cross-origin WebSocket to the Theia backend, whose token gate checks only the cookie.
   - Prevention: add an Origin check to the token gate, and test whether orcad accepts a `localhost` host.
6. **Keyboard collisions (P-7).**
   - The reserved page keys (Ctrl+T, Ctrl+W, Ctrl+Tab, Ctrl+Shift+Tab, Ctrl+PageUp/PageDown; `powerbrowser.js:430-446`) fire even if the page calls `preventDefault`.
   - Ctrl+W is "delete word" in an Orca terminal.
   - Prevention: a per-tab key policy.
7. **Egress escapes the allowlist (P-8).**
   - Bundle strings name PostHog, Sentry, `*.onorca.dev` (push, login, relay, connector, share, feedback) and Google favicons.
   - Prevention: environment flags, allowlist rows, NG-069 layer 4 extended to orcad, and a host list derived from the bundle.
8. **Pin drift (P-10) and per-OS differences (P-13).**
   - Generic ELF files do not start on NixOS outside an FHS environment.
   - Patching changes hashes that orcad verifies (unverified).
   - macOS arm64 needs at least ad hoc signing and quarantine handling.
9. **Other.** Replacing Chromium opens a new remote-control surface (P-16). Flatpak `--filesystem=home` turns the allow-list check red (P-17).

## Research Disagreements

**(a) Client-host lease seam (S2).**
- **FEATURES A.0:** lists S2 as an option that needs no Orca patch. A paired client holds a lease, and orcad sends it `createPage`, `navigate`, `automation` (65 methods), `reclaimPage` and `closePage` (`src/shared/browser-client-host-protocol.ts:207-250`, RPC `browser.clientHost.attach`). FEATURES rates the chance that a client other than Electron is accepted as LOW, and marks it unverified.
- **ARCHITECTURE Q6:** rejects S2 for v1.7. PB would have to implement Orca's private runtime RPC, with end-to-end encryption, lease semantics and no version guarantee. It recommends Option B instead: a generic "external bridge" provider contributed upstream, with PB implementing the other end.
- **Resolution:**
  - Plan on S1, through an upstream-friendly generic bridge, as the primary route. S2 stays a spike question, not a decided route.
  - The spike must answer FEATURES question 1 with evidence: can a PB-side client attach with a web-client device token, and are the 65 methods enough?
  - The upstream conversation should also ask whether Orca would accept a client host that is not Electron.
  - ARCHITECTURE's last resort is a CDP-emulating `ORCA_BROWSER_EXECUTABLE`.

**(b) Remote Agent / BiDi in production.**
- **ARCHITECTURE** (Option A, "reject for production") **and PITFALLS** (P-16) say no:
  - The Remote Agent has no authentication. Any local process that finds the port controls the whole browser, including the Theia frame and cookies.
  - `--remote-allow-system-access` extends that control to chrome.
- **FEATURES** agrees, and adds that BiDi allows only one session (MDN BCD `session.new` `multiple_sessions=NO`), which PB's test harness already holds.
- **STACK 7.2** states the same opinion, but its coverage table maps nearly every `RuntimeBrowserCommands` method to a BiDi command, so it reads like a BiDi-based provider.
- **Resolution:**
  - BiDi is only a test, spike and coverage-measurement tool. There is no production Remote Agent port.
  - STACK's mapping stays as a pointer for coverage. The implementation transport is the chrome-side bridge with actors.
  - Open spike question: can the Remote Agent modules run in-process for the one target browser? Each internal import would be a catalogue row.
  - Real Gecko 153 gaps: no accessibility-tree command, `startScreencast` arrives in 154, and `emulation.setMediaFeaturesOverride` arrives in 159.

**Minor divergences:**
- FEATURES counts 83 provider members and 65 automation methods, while ARCHITECTURE counts 66 page-level `browser.*` methods. The spike should produce one reconciled table.
- STACK recommends 1.4.248, but most evidence was read on the 1.4.214 source and the 1.4.245 build, which were not diffed.

## Owner Decisions the Research Raised

The recommendations below come from the researchers or the synthesizer. None of them is a decision.

1. **Quit and orphan policy** (before phase 61): stop everything on quit, or let sessions survive and re-adopt them. Recommended: stop on quit, with a notice in PB copy when sessions are live.
2. **Telemetry opt-out** (before phase 61):
   - Set `ORCA_TELEMETRY_DISABLED=1` and `DO_NOT_TRACK=1`. Recommended: yes (`consent.ts:53-56`).
   - Also decide how to treat the push, login, relay, share, feedback and update endpoints: block them, allowlist them, or disable them through the environment.
3. **What "move between modes" means** (before phase 62).
   - The main area is shared by all modes (`main-area-exemption.ts:14-16`), so an Orca tab already stays visible in every mode.
   - Is per-mode tab membership intended? If not, "move" needs no action, and the Orca mode is side-panel and chrome presentation plus reveal-on-activate.
   - Web tabs are not `ExtractableWidget`, so they cannot open in a secondary window.
   - A fourth mode touches seven consumers, and any toggle that cycles through three modes (`mode-descriptors.ts:5-6`).
4. **Remote Agent exposure** (before phase 60 concludes): confirm there is no Remote Agent port in production, and check PB policy for a `DisableRemoteDebugging`-style option.
5. **Second Node 24.22.1** (before phase 59): ship it separately (about 94-127 MB per OS), or bump `node-runtime.json` and share the bytes (a symlink on POSIX, a copy on Windows). Recommended: ship it separately in v1.7.
6. **Orca pin** (before phase 59): 1.4.248 (recommended, hashes computed) or 1.4.245 (the build that was run live). Also set how often to re-pin.
7. **Hidden Electron process when Orca desktop is installed** (before phase 61):
   - orcad probes `/usr/bin/orca-ide`, `/usr/local/bin/orca-ide`, `/opt/Orca/orca-ide`, `~/.local/bin/orca-ide`, `/Applications/Orca.app` and `%LOCALAPPDATA%\Programs\Orca\Orca.exe`.
   - Accept it, or prevent it?
8. **Add project with no `repo remove`** (before phase 64): the CLI has `list, add, show, set, set-base-ref, search-refs`, so PB cannot undo a mistaken add. Decide the confirmation and validation scope.
9. **Keyboard collisions such as Ctrl+W** (before phase 62): a per-tab key policy, remapping, or accept them.
10. **Cookie and origin isolation** (before phase 63): accept an Origin check in the token gate, and test whether orcad accepts `localhost`.
11. **Agent defaults reachability** (P-19): agents keep skip-permissions on, so confirm that any page holding the offer is an accepted trust boundary.
12. **Upstream Orca contribution** (phase 60): will PB open the conversation, and what is the fallback if Orca declines? The options are S2, CDP emulation, or dropping D-1 from scope.
13. **Chrome additions** (phase 65):
    - Confirm the scope of the chrome-bar agent indicator and stop control against hard rule 5.
    - `REQUIREMENTS.md` and `PROJECT.md` disagree about downloads, site info and permissions. Settle that before claiming parity with Orca's browser.

## Implications for Roadmap

Phases are numbered from 59, after v1.6's phase 58.

```
59 Pin+fetch -> 61 Launcher -> 62 Tab+scheme+mode -> 63 Actor -> 65 Browser build -> 66 Cross-OS
   |               |                                   ^             ^
   |               +--> 64 Add project + credentials   |             |
   +--> 60 Parity spike + upstream conversation (from day 1) --------+
```

### Phase 59: Orca pin and per-OS fetch
- **Rationale:** every later phase needs a runnable orcad. No dependencies.
- **Delivers:**
  - `scripts/fetch-orca.sh`, and a pin (version and hash per OS) in `configuration.toml`.
  - Slot extraction, including Node 24.22.1 and a recomputed `.version`.
  - A hash check against `orcad-template.json`.
  - A `--quick` check that the pin names an existing version and every OS has a hash.
  - A licence allow-list row, and "Orca" classified only in `inventory/brand-tokens.json`.
- **Addresses:** T-2 (fetch half) and T-12 (artifact half).
- **Avoids:** P-10, P-12, and the target choice in P-13.
- **Linux-closable:** mostly. Archive hashes and extraction for macOS and Windows can be checked on Linux.
- **Manual items:** running the macOS and Windows slots, and how the generic ELF natives behave on NixOS outside FHS.
- **Research flag:** standard, plus one probe: does orcad accept binaries that were patched after fetch?

### Phase 60: Browser-parity spike and upstream Orca conversation (parallel from day 1)
- **Rationale:** it has the longest lead time, because an upstream merge reaches PB only through a re-pin. Chris directed spike first.
- **Delivers:**
  - One reconciled inventory and gap table (BiDi, BiDi+, ACT, NATIVE, NO), naming who uses each ability.
  - Answers to FEATURES questions 1-8.
  - Whether stock orcad advertises `browser.screencast.v1`.
  - The answer on running the Remote Agent modules in-process.
  - A draft upstream proposal for a generic external-bridge provider, with the conversation opened in week one.
- **Addresses:** direction note items 1-4. It is a prerequisite for D-1, D-2 and the final form of T-9.
- **Avoids:** P-16.
- **Linux-closable:** yes, using spike 003's harness. The upstream response is external, so record its status in STATE.
- **Research flag:** this phase is the research, and its output may reshape or drop phase 65.

### Phase 61: orcad launcher and supervisor
- **Rationale:** the foundation for everything that touches the process. Needs 59.
- **Delivers:**
  - `OrcaService`, the supervisor and prefs.
  - The environment allowlist with the `ORCA_*` scrub, setting both profile variables.
  - Telemetry flags, and a ready-line parser that bypasses logging.
  - The loopback assertion, the pinned port, `--reclaim-stale-lock`, and handling for exit 78.
  - The state file and reaping, quit hooks, diagnostics rows and `INTERNAL-APIS.md` rows, each with `--self-test` fault planting.
  - Egress allowlist rows, and NG-069 layer 4 extended to orcad.
- **Addresses:** T-2, T-6 (launch failures) and T-10.
- **Avoids:** P-1, P-2, P-3, P-4, P-6, P-8 and P-14.
- **Linux-closable:** yes for the Linux path.
- **Manual items:** Windows graceful stop, conpty breakaway and reaping, and the macOS launch.
- **Owner decisions:** 1, 2 and 7.
- **Research flag:** needs research on managed stop and idle exit for a third-party launcher, on orcad's parent-death handling, and on busy-port behaviour.

### Phase 62: `pb-orca:` tab, scheme and Orca mode
- **Rationale:** needs the origin from 61. Settle "move between modes" first, because the answer may remove work.
- **Delivers:**
  - The `address` option and the `uriOf` change, `PbOrcaOpenHandler`, `docs/URI-SCHEMES.md`, a round-trip check, and `verify-registry-shape.mjs` run unchanged.
  - The `orca` mode descriptor in `SHIPPED_MODES` and `ChromeBarWidget.MODES`.
  - A singleton tab that re-pairs on restore, an Organising row, a per-tab key policy, and a failure page in PB copy.
  - Orca browser entry points hidden or routed.
- **Addresses:** T-1, T-4, T-5, T-6 and T-9.
- **Avoids:** P-7, P-15, P-19 and P-20.
- **Linux-closable:** yes.
- **Owner decisions:** 3 and 9.
- **Research flag:** standard once those are decided.

### Phase 63: `PowerBrowserOrca` actor, pairing delivery, origin gate
- **Rationale:** needs a real tab (62) and the offer (61).
- **Delivers:**
  - The actor pair, gated on the port and registered in `registerGroupActor`.
  - The logo swap, the settings seed, and the stylesheet through `jar.mn`.
  - Pairing delivery without a URL, and an Origin check in the token gate.
  - Catalogue rows, containment checks with the profile grep, and a selector list per Orca version.
- **Addresses:** T-3, T-11 and T-9 (hides).
- **Avoids:** P-1, P-5 and P-11.
- **Linux-closable:** yes, using the live GUI debug loop.
- **Timing probe (in this phase):** child `sendQuery` versus the client's first read of `location`, and whether the sheet applies without a visible flash. If the probe fails, fallback (b) or (c) from ARCHITECTURE Q2 applies within the phase.
- **Also check:** whether the existing `PowerBrowserGroup` actor, which matches `http://127.0.0.1/*`, loads in the Orca tab.
- **Owner decision:** 10.
- **Research flag:** probe, then standard.

### Phase 64: Add project and credential-storage check
- **Rationale:** needs only 61, so it can run beside 62 and 63.
- **Delivers:**
  - The Add-project UI and `orcaAddProject` through the slot CLI, with both profile variables and the same scrubbed environment.
  - A validated absolute path, a copy table, silent-failure handling, and a check of `_meta.runtimeId` against the ready line.
  - The credential check:
    - covers the persistent profile, the state file and `orca-secret-protection.json`, with a plaintext control run;
    - refuses `ORCA_HEADLESS_SECRET_STORE=plaintext`;
    - reports that protection is a same-user key file, not an OS keyring.
- **Addresses:** T-7 and T-8.
- **Avoids:** P-9, P-18 and P-21.
- **Linux-closable:** yes.
- **Manual items:** macOS and Windows credential key paths (`~/.orca/`, `%USERPROFILE%\.orca\`).
- **Owner decision:** 8.
- **Research flag:** standard.

### Phase 65: Browser replacement build (gated; may split or descope)
- **Rationale:** needs 60 (design), 63 (actor), and an upstream merge that is then pinned. A local Orca build is allowed for development only. Phases 59-64 ship without this phase.
- **Delivers, if 60 confirms the route:**
  - The OrcaService side of the bridge, the socket in the `0700` data root, and the `browserPageId` map.
  - Actor automation handlers, marking of agent-owned tabs, and the Tier 1 commands.
  - Unsupported commands return `browser_command_unavailable` and `browser_screencast_unavailable`; screencast stays off.
  - The chrome-bar agent indicator and stop control.
- **Addresses:** D-1 and D-2, then D-3 and D-4.
- **Avoids:** P-16 and P-5. Only Orca-created tabs can be addressed, with per-tab grants and no TCP port.
- **Linux-closable:** technically yes, but blocked outside PB until the upstream change merges and is re-pinned.
- **Owner decisions:** 4, 12 and 13.
- **Research flag:** research at phase level, after 60.

### Phase 66: Cross-OS packaging and verification
- **Rationale:** needs everything. Human checks and live re-runs are deferred to one end-of-milestone pass.
- **Delivers:**
  - A per-OS packaging table.
  - Flatpak `--filesystem=home`, with a `verify-flathub-manifest.mjs` change and its self-test.
  - Nix assembly, including how `autoPatchelfHook` interacts with the hashes.
  - macOS ad hoc signing and quarantine handling. There is no store signing, Linux ships alone, and Windows signing never blocks Linux.
  - Windows launch and stop, and the release assets.
  - `verify-platform.sh` rows: one row per check, and no sibling driver.
- **Addresses:** T-12.
- **Avoids:** P-13, P-17, P-4 (the Windows part) and P-10.
- **Linux-closable:** only the Linux, Nix and Flatpak parts.
- **Manual items (need a macOS host and a Windows host):**
  - Launching the slot.
  - Gatekeeper and quarantine.
  - Whether re-signing Mach-O files changes the `orcad-template.json` hashes.
  - Windows graceful stop, reaping and conpty breakaway.
  - PE signing and installer layout.
  - Credential key paths.
- **Research flag:** needs real macOS and Windows hosts; the rest is standard.

### Phase Ordering Rationale
- **59 and 60** have no dependencies and start together on day 1. 60 is the only phase that can reshape the milestone, and its upstream conversation has the longest lead time.
- **61 before 62,** because the tab needs an origin. **62 before 63,** because the actor needs a real tab to gate on.
- **64** needs only 61.
- **65** is the last feature phase because it needs an external merge. The milestone ships a complete Orca mode without it.
- **Egress, credentials and brand classification** are folded into 59, 61 and 64. Raise the egress question in 61, because it can force a decision about blocking network access.
- **Closable on Linux:** 59 (artifact side), 60, 61 (Linux path), 62, 63 and 64.
- **Need macOS or Windows hosts:** parts of 59, 61 and 64, and most of 66.

### Research Flags
- **Need deeper research:** 60 (it is the research), 61, 63 (the timing probe), 65 and 66.
- **Standard patterns:** 59 (apart from the patched-binary probe), 62 and 64.

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | MEDIUM-HIGH | Linux x64 on 1.4.245 was launched in four runs. Hashes were recomputed for the deb, the mac zip and the Windows installer. The macOS and Windows launches were not run, and 1.4.248 slot provisioning was not executed. |
| Features | HIGH for the inventory, MEDIUM-LOW for the Gecko mapping | The inventory was counted from source by script. The Gecko mapping is a guess except for navigation, screenshot and `performActions` (spike 003). `agent-browser` behaviour is LOW, and S2 acceptance is LOW. |
| Architecture | MEDIUM | The PB side was read from source (HIGH). The Orca side was read from the 1.4.214 source and the 1.4.245 build, which were not diffed. Gecko behaviours marked "verify" were not run. |
| Pitfalls | MEDIUM-HIGH | Each finding is tagged [src], [live] or [unverified], with a named check. |

**Overall confidence:** MEDIUM-HIGH for the hosting track, MEDIUM-LOW for browser replacement.

### Gaps to Address

- **Pairing and restore:** whether Places or sessionstore keeps the `#pairing=` fragment after the client strips it, and whether `history.replaceState` records a visit (61/63).
- **localhost:** whether orcad accepts `Host: localhost` (63).
- **Process lifecycle:** whether orcad handles parent death, and whether a third-party launcher can use managed stop and idle exit (61).
- **Offer lifetime:** whether orcad generates a new pairing offer on each start, and whether an offer can be revoked (61).
- **localStorage:** which keys hold layout and settings (63).
- **Writes outside the profile:** which paths orcad writes outside `ORCA_USER_DATA` when `HOME` is clean (61).
- **Outbound contacts:** whether the web client or orcad contacts Google favicons or Orca-operated hosts beyond the environment names found. orcad makes an outbound fetch at start (`[agent-state-rules] download failed: HTTP 404`) (61).
- **Site data on exit:** whether PB clears site data on exit, which would force re-pairing on every launch (62/63).
- **Screencast:** whether stock orcad advertises `browser.screencast.v1` with no provider, and what the client then shows (60/62).
- **Patched binaries:** whether orcad accepts binaries that were re-signed or patched after fetch (59/66).
- **Windows jobs:** how the terminal daemon behaves under Gecko `Subprocess` job objects on Windows (66).
- **Version diff:** the 1.4.245 build was not diffed against the 1.4.214 source. Re-check the cited lines at pin time.
- **PB chrome state:** the state of downloads, site info and bookmarks in PB chrome; `REQUIREMENTS.md` and `PROJECT.md` disagree.
- **Page hosting:** whether a web client in a PB tab can host browser pages for orcad (60).
- **Selectors:** Orca's classes and localized alt text are not a stable API. Pin a selector list for each Orca version.

## Sources

- **Orca source** at `/home/chris/coding/orca-eval` (HEAD 3052dd79, 1.4.214):
  - `src/shared/{node-runtime-pin,orcad-artifacts,appimage-node-runtime,tab-types,browser-client-host-protocol,browser-client-automation-protocol}.ts`
  - `src/main/orcad/*`
  - `src/main/runtime/browser/browser-commands.ts`
  - `src/main/telemetry/consent.ts`
  - `src/cli/runtime/{serve-orcad-launch,launch-user-data-path}.ts`
  - `vite.web.config.ts`
- **Orca builds:** the installed build `/nix/store/zqzrjgzy297m4b7pgr0k2165l3wmhix8-orca-ide-1.4.245-extracted/resources/`, and the researchers' own downloads of the 1.4.248 deb, mac zip and Windows installer (sha256 matched the GitHub API digests).
- **Node:** nodejs.org/dist/v24.22.1/SHASUMS256.txt, plus local hashing of three archives.
- **Gecko tree** `upstream/` 153.5.1esr:
  - `remote/webdriver-bidi/modules/root/*.sys.mjs`
  - `remote/marionette/driver.sys.mjs`
  - `remote/components/RemoteAgent.sys.mjs`
  - `dom/interfaces/base/nsIDOMWindowUtils.idl`
  - `dom/ipc/jsactor/JSWindowActorProtocol.cpp`
- **Web:** MDN browser-compat-data `webdriver/bidi/*.json` (8.1.8), fxdx.dev posts on the removal of CDP in Firefox 141, the `vercel-labs/agent-browser` README, and the W3C WebDriver BiDi spec.
- **PB tree:** as cited in the four research files (shell sources, `INTERNAL-APIS.md`, `docs/URI-SCHEMES.md`, `scripts/*`, `theia/extensions/{tab-uris,modes,chrome-bar}`, the flatpak and nix files, `CLAUDE.md`).
- **Planning:** INPUTS.md, NOTE-orca-tab-parity-direction.md, ORCA-REBRAND-SURVEY.md, spike 003, the spike-findings Orca hosting reference, and SEED-261103-o1g.

*Research completed: 2026-11-04. Ready for roadmap: yes.*
