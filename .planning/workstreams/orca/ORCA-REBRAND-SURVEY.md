# Orca names in PowerBrowser's Orchestration mode: rename, hide or keep

Source roots: Orca source is /home/chris/coding/orca-eval at 3052dd79, version 1.4.214. The installed build is /nix/store/zqzrjgzy297m4b7pgr0k2165l3wmhix8-orca-ide-1.4.245-extracted/resources/, written below as "bundle/". PB files are relative to [/home/chris/orca/workspaces/Power-Browser/v1.7-Orca-integration/](.). The key PB files are [/home/chris/orca/workspaces/Power-Browser/v1.7-Orca-integration/.planning/spikes/003-orca-headless-client-in-pb/results.md](.planning/spikes/003-orca-headless-client-in-pb/results.md), [/home/chris/orca/workspaces/Power-Browser/v1.7-Orca-integration/.planning/seeds/SEED-261103-o1g-orca-mode-milestone.md](.planning/seeds/SEED-261103-o1g-orca-mode-milestone.md), [/home/chris/orca/workspaces/Power-Browser/v1.7-Orca-integration/theia/extensions/modes/src/browser/mode-descriptors.ts](theia/extensions/modes/src/browser/mode-descriptors.ts) and [/home/chris/orca/workspaces/Power-Browser/v1.7-Orca-integration/theia/extensions/tab-uris/src/browser/web-tab.ts](theia/extensions/tab-uris/src/browser/web-tab.ts).

## 1. Verdict

PB can rename everything it owns cheaply: the mode label, mode id, URI scheme, tab title, tab icon, its own copy and the diagnostics labels. It can hide a few Orca marks through Orca's own settings or through PB-side injection. Everything inside Orca has to stay "Orca", because Orca has no white-label or product-name hook:

- The name is a literal in about 1,388 places in en.json across 11 locales (orca-eval/src/renderer/src/i18n/locales/en.json; the only `{{appName}}` is at :1129).
- Orca's only override path, plugin language packs, is switched off in the web client (web-plugins-api.ts:3-15).
- Every agent, wire and filesystem name (`orca` CLI, the 391 ORCA_* variables, TERM_PROGRAM, orca://pair, the data-file names) is read by literal name on both sides.

The biggest constraint is that renaming Orca's own UI copy or agent-facing names needs either a forbidden patch or an upstream PR that is unlikely to be accepted.

Two spike corrections affect the build:
- **Wrong bundle path.** The hosted client is bundle/app.asar.unpacked/out/renderer/web-index.html, not out/mobile-web (results.md:10; bundled-web-client-root.ts:8-28).
- **Wrong profile variable.** A directly spawned orcad picks its profile from `ORCA_USER_DATA`, not `ORCA_USER_DATA_PATH` (orcad-app-paths.ts:14-21; orcad-entry.ts:44-46 overwrites the latter). README.md:85-87, results.md finding 1 and the pb-side notes carry the wrong name.

## 2. Rename to Orchestration (PB-owned, easy)

- Mode label "Orchestration" — rename — PB code: append to SHIPPED_MODES (mode-descriptors.ts:22-50) and to ChromeBarWidget.MODES (chrome-bar-widget.tsx:389); verify-mode-toggle-commands.mjs:24-35,128-148 checks that the two match — low. Upgrade risk: a user's custom mode with the same name is skipped at load without warning (mode-service.ts:205).
- Mode id `orchestration` — rename — PB code: the id is the label lowercased (chrome-bar-widget.tsx:1411; enforced at verify-mode-toggle-commands.mjs:148) — trivial. It is persisted (mode-service.ts:696; setups-service.ts:673,946), so fix it before the first release.
- Tab URI scheme `orchestration:`, not the seed's `orca:` (seed:51) — rename — PB code — low. `orca:` collides with Orca's pairing scheme (pairing.ts:26,48) and with the OS handler Orca desktop registers (orca-ide.desktop:10). Add coverage in verify-uri-roundtrip.mjs and docs/URI-SCHEMES.md without changing TabUriRegistry's asserted shape.
- Web tab label "Orca Web" (bundle/out/renderer/web-index.html:6) — rename — PB code: override the widget title for the orcad origin (web-tab.ts:928-931) — low. The renderer never assigns document.title (only read, at web-pairing.ts:100), so the override holds. Do not use the URL as the caption (web-tab.ts:931), because it exposes the pairing fragment.
- PB-authored copy that refers to the place, e.g. "PowerBrowser couldn't start Orchestration…" — rename — PB code — trivial. A bare "Orca" is ambiguous with the GNOME Orca screen reader (orca-ide:15; cli-resolution.md:12-14).
- Diagnostics row labels, e.g. "Orchestration service (Orca orcad)" and "Orchestration service log" — rename — PB code — trivial. orcad names, ports, ORCA_* values and the pairing URL go only in Details rows (verify-shell-error-copy.mjs:91-96).
- Planning and skill text that says "Orca mode" or `orca:` (seed:33,51; .claude/skills/spike-findings-Power-Browser/SKILL.md:38; references/orca-client-hosting.md:14,64) — rename — PB docs — trivial. Fix this before planning, because agents load these files.

## 3. Rename to PowerBrowser

- Product name in all PB copy for the mode — PowerBrowser — PB code: interpolate applicationName in chrome-bar copy (chrome-bar-copy.ts:350; verify-shell-error-copy.mjs:1067,1099); use the literal in shell error tables (verify-shell-error-copy.mjs:319) — low.
- Tab icon — PowerBrowser/Orchestration icon — PB code — trivial. Orca ships no favicon or PWA manifest: web-index.html has no rel=icon, and orcad's static allow-list rejects /favicon.ico (orcad-server.js:7191).
- PB error page that replaces Orca's "Can't reach Orca server" and "Orca web hit a renderer error." (web/main.tsx:94; en.json runtimeHostUnreachable) — PowerBrowser — PB code: watch orcad health on the sidecar side — medium.
- Default host name "Orca Server" (web/main.tsx:56; web-runtime-environment.ts:155; 34 hits in 12 built files) — PowerBrowser — PB injection that rewrites the localStorage record 'orca.web.runtimeEnvironment.v1' — medium.
  - Every auto-pair from #pairing= rewrites the name back (web-runtime-environment.ts:147-155), so a rewrite only survives if PB stops passing the fragment once an environment is stored.
  - The same record holds the device token and keys.
- Shell prompt "orca-ide-1.4.245-fhsenv:" in Orchestration terminals (fhsenv-rootfs/etc/profile:1; results.md:20) — PowerBrowser — PB code: a PB-owned buildFHSEnv named e.g. "powerbrowser", or nix-ld — low. Setting PS1 in the environment does not help, because /etc/profile overwrites it. The env must still provide /lib64/ld-linux-x86-64.so.2 and the tools orcad expects (results.md:21).
- Process title of orcad — e.g. "powerbrowser-orchestration" — PB spawn flag: `node --title=<name>` — low. Orca never assigns process.title. Whether the forked daemon-entry.js child inherits the title was not checked.

## 4. Hide rather than rename

- Titlebar "Orca" label (TitlebarLeftControls.tsx:64-72; default true at default-global-settings.ts:162) — hide — Orca setting showTitlebarAppName=false, seeded by PB into localStorage 'orca.web.settings.v1' (web-storage.ts:1) — low once an injection route exists. Orca config cannot set it. The value is stored per origin, port included.
- Sidebar "Orca Mobile" entry with "New" badge (SidebarNav.tsx:20-22,241) — hide — Orca setting showMobileButton=false — low; same seeding and port caveats.
- Landing logo and "ORCA" wordmark (Landing.tsx:264-270) — hide or keep (owner decision 3) — PB-injected CSS — medium. The alt text is localized and the classes are not a stable API, so re-check on every re-pin.
- Onboarding checklist entry and OrcaLogoSettingsIcon (settings-navigation-capability-sections.ts:148-171) — hide — PB injection — medium.
- Appearance > App icon selector (AppIconSelector.tsx:3-5; AppearancePane.tsx:271-290) — hide, low priority — PB injection — medium.
- Send Feedback dialog (SidebarFeedbackDialog.tsx:151) — hide — PB injection — medium. The web client has no feedback module, so the call resolves to undefined (web-fallback-api.ts:3-80) and the menu item does nothing.
- "Check for Updates" (no-op, web-updater-api.ts) and "Restart Orca" (only reloads the tab, web-app-api.ts:30) — optional hide — PB injection — medium.
- Address pill URL `http://127.0.0.1:<port>/web-index.html` — hide behind `orchestration:` — PB code: load `/#pairing=…`, because "/" maps to web-index.html (static-web-client-handler.ts:7-8,141-142) — low.
- Pairing URL and offer, a reusable bearer credential (pairing.ts:26; results.md finding 4) — keep out of history, session restore and copy — PB code — low.
- WebSocket port — fixed PB-chosen `--port`; fail visibly if it is taken; never use `--port 0` — orcad flag (orcad-command-arguments.ts:14-15) — trivial. A moving port drops every orca.web.* localStorage value, including the pairing. Orca's own default also falls back and persists the fallback in mobile-ws-fallback-port.json.
- Inherited ORCA_* variables plus the Orca-desktop variables ELECTRON_PA_APP_NAME, CHROME_DESKTOP, APPDIR, GSETTINGS_SCHEMA_DIR, LD_LIBRARY_PATH and XDG_DATA_DIRS — strip in PB's orcad spawner — PB code — trivial. The spike hit runtime_serve_already_running this way.
- Telemetry, as a guard against a future re-pin — set DO_NOT_TRACK=1 or ORCA_TELEMETRY_DISABLED=1 in the spawn env (consent.ts:52-63) — env — trivial. The 1.4.245 build compiles in no PostHog key (0 `phc_` hits).

## 5. Keep Orca

**UI copy and web-client internals**
- Orca's UI copy: en.json has 1,262 values with 1,388 occurrences, en-runtime-required.json has 157, and the built bundle has 1,666 occurrences in 110 of 938 JS files — keep — compat. There is no brand variable, packs are desktop-only, and a DOM rewrite would corrupt terminal, agent and file-name text. The copy names the engine accurately.
- Orca's own "Orchestration" Settings section, "Coordinate multiple coding agents through Orca." (settings-navigation-capability-sections.ts:67-79; built useSettingsNavigationMetadata-DSrprK3c.js and Settings-BQHiEir8.js; 27 asset files contain "Orchestration"), and the crew panel (OrchestrationCrewPanel.tsx:264) — keep — compat. This collides with the mode name today, not only after a future re-pin (owner decision 2).
- WebConnect "Connect to Orca" screen (WebConnect.tsx:123,127) — keep — compat. It only appears when PB's auto-pair fails, so PB should re-pair itself.
- Help links: about 20 onorca.dev URLs, github.com/stablyai/orca 8 times plus 3 /issues URLs, Discord twice, x.com/orca_build (SidebarSettingsHelpMenu.tsx:49-53) — keep — attribution.
- Never rendered in the web client, so nothing to do — keep:
  - titlebar logo (TitlebarLeftControls.tsx:45)
  - onboarding modal (web-onboarding-api.ts:20-23)
  - Orca Account section (settings-navigation-capability-sections.ts:131-144)
  - update, star-nag and telemetry prompts (no-op stubs)
  - notification titles (the web bundle makes no `new Notification(` calls)
- localStorage keys orca.web.*, data-orca-* attributes and auto.* i18n keys (web-storage.ts:1-11) — keep — compat; renaming would discard stored pairings.

**Agent-facing names**
- `orca` and `orca-ide` CLI shims on the agent PATH (orcad-cli-launcher.ts:33,41) — keep — agents. 11 bundled skills and 340 runtime message lines tell agents to run `orca …`.
- The 391 distinct ORCA_* names (agent hook and pane variables, ORCA_CLI_COMMAND, ORCA_USER_DATA and others) — keep — agents and compat. PB may set values, never names.
- TERM_PROGRAM=Orca (spawn-environment.ts:180-185) — keep — agents. It is written after the env spread, so PB cannot override it.
- X-Orca-* hook headers, about 20 names — keep — agents.
- Hook scripts in ~/.orca/agent-hooks and the 16 'orca' lines in ~/.claude/settings.json (installer-utils.ts:112-115) — keep — compat. They are shared with desktop Orca and ignore ORCA_USER_DATA.
- 11 bundled skills, including `orchestration`, and the `orca orchestration …` subcommands — keep — agents. PB must not name any agent-facing artifact "orchestration" (skill, CLI, env var, AGENTS.md section).
- Identity preamble "You are working inside Orca, a multi-agent IDE." (orca-dispatch-status-prompt.ts:4,8; it doubles as a parse marker at :17) — keep — agents.
- Codex clientInfo `orca_desktop` (codex-app-server-handshake.ts:11) and Jira `User-Agent: Orca` (cloud-gateway.ts:7) — keep — protocol.

**Files, paths and wire formats**
- Data-root files: orca-runtime.json, orcad.lock, orca-devices.json, orchestration.db, daemon sockets and others (runtime-bootstrap.ts:42; orcad-instance-lock.ts:44) — keep — compat.
- Paths outside the data root: /tmp/.orca-daemon-<uid>, ~/.orca/*, ~/.config/orca (daemon-socket-endpoint-path.ts:10-14) — keep — compat. PB must never point orcad at ~/.config/orca.
- systemd units orca-daemon-*.scope, orca_pty_*.scope and orca_ptys_*.slice (daemon-cgroup-scope.ts:11,23) — keep — compat; teardown matches these names.
- orca://pair scheme and offer payload; `orca-client=web` query parameter — keep — compat with Orca desktop and mobile.
- orcad.js, orcad-server.js and daemon-entry.js — keep — PB spawns them by path.
- `--web-client-root` set to the unmodified bundle/app.asar.unpacked/out/renderer — keep — compat. out/mobile-web has no web-index.html (orcad-command-arguments.ts:119-121).
- Log prefixes ([orcad] 48, [daemon] 72, …) and version strings "Orca 1.4.245 (orcad 0.1.0+hash)" — keep — show only in diagnostics rows.
- orca.yaml, .orca/issue-command, the `.orca` line appended to .gitignore, ORCA_ROOT_PATH and ORCA_WORKTREE_PATH (hooks.ts:101-103; issue-command-file.ts:163-180) — keep — compat with Orca users' repos.
- Worktree root ~/orca/workspaces (constants.ts:86-90) — keep for now — compat. A web Settings override exists (WorkspaceDirectorySetting.tsx:48-88) but its effect is untraced (owner decision 10).

**PB-side names, legal and network**
- PB internal names OrcaService.sys.mjs, powerbrowser.orca.* prefs and POWERBROWSER_ORCA_* (if any are needed) — keep — they name the component, as TheiaService.sys.mjs does. Users never see them, and nothing exists yet.
- configuration.toml — keep Orca out of it — compat. A `[modes]` section fails verify-mode-toggle-commands.mjs:44-47,231-241, and third-party names stay fixed (docs/REBRANDING.md:105-109).
- inventory/brand-tokens.json — keep Orca out of it. The scan only probes sourcerer and deocracy (brand-tokens.json:22-24), and the 1.4.245 bundle has 0 hits.
- MIT notice "Copyright (c) 2026 Lovecast Inc." (orca-eval/LICENSE:1-3; it also ships as the app.asar root LICENSE, 1,070 bytes) — keep — legal.
  - Add an Orca section to [/home/chris/orca/workspaces/Power-Browser/v1.7-Orca-integration/scripts/generate-licensing.mjs](scripts/generate-licensing.mjs), sourced from the pinned LICENSE.
  - orcad-template/ carries no LICENSE of its own, so PB must supply it.
  - Difficulty: low to medium.
- Orca build identifiers productName/appId 'Orca' / 'com.stablyai.orca' (electron-builder.config.cjs:105,239) — keep — never visible in the tab.
- Egress: the 127.0.0.1 allowlist row reason text should name orcad. push.onorca.dev is the only Orca host in orcad. Keep — names no rows.
- PB .desktop files — keep — never add x-scheme-handler/orca (powerbrowser.desktop:13), which would capture Orca's pairing links.

## 6. Only renameable by patching (forbidden) or an upstream PR

- Orca UI copy brand — upstream PR adding a product-name variable to about 1.4k strings in 11 locales, against Orca's keep-brand-names-exact rule (config/localization-audit.md:30) — high, unlikely to be accepted.
- Language packs and themes served to the paired web client over RPC — upstream PR — medium. It would give PB a supported string and palette override.
- orcad option that sets the web-index `<title>` — upstream PR — medium. It is not needed, because the PB tab-label override already works.
- Display name carried in the pairing fragment, to replace "Orca Server" — upstream PR — medium.
- TERM_PROGRAM option — upstream PR — high.
- systemd unit prefix option — upstream PR — high.
- Server and CLI 'Orca' strings that reach the UI as RPC errors (non-test literals: src/cli 744, src/shared 460, src/main/runtime 138, src/main/orcad 38) — upstream PR — high. Which of them reach the UI was not traced.
- Patch only (forbidden):
  - `orca` CLI name and ORCA_* names
  - data-root and home file names
  - orca://pair
  - localStorage keys
  - preamble text
  - hook paths and X-Orca-* headers
  - skill names
  - orca.yaml and setup-hook variables
  - orca_desktop and the Jira User-Agent
  - build productName
- Serving an edited copy of the bundle through `--web-client-root` — technically works, because the allow-list has no hashes (bundled-web-client-manifest.ts:4-29) — forbidden as patching and vendoring.

## 7. Undecided — owner decisions

1. What should the PB-owned orcad data-root directory be called? Options: `<PB profile>/orchestration`, `powerbrowser-orca` (following the powerbrowser-theia precedent, TheiaService.sys.mjs:615-619), or a PowerBrowser-named directory. It is set through `ORCA_USER_DATA`. Renaming it after release orphans pairings and agent state.
2. Orca already shows an "Orchestration" Settings section inside the mode. Accept the duplicate, hide it by injection, or pick another mode name?
3. Should the Landing logo and "ORCA" wordmark stay as attribution, or be hidden by injection?
4. Which injection route should PB build to seed settings and apply hides? Option A: a new JSWindowActor that calls windowUtils.loadSheet. It needs a new INTERNAL-APIS.md catalogue row and widens the "no DOM write" privilege row (PowerBrowserAPI.sys.mjs:2256 is the only registration today). Option B: a PB-shipped WebExtension content script through the patch 050 tab visibility. No built-in extension shipping mechanism was found, and match patterns ignore the port, so it would also run on any user dev server on 127.0.0.1.
5. "Orca Server" host name: rewrite it from PB (fragile, touches the credential record), file an upstream PR, or accept it?
6. Should PB apply its own colour palette by overriding Orca's CSS tokens (--background, --primary; main.css:57-94)? Medium fragility, and it bypasses Orca's contrast test.
7. Add an About-dialog line "includes Orca by Lovecast Inc." through the generator and FALLBACK_LEGAL_NOTICES (powerbrowser-about-dialog.tsx:26-30)? MIT does not require it.
8. Flatpak: the sandbox has no home access (flatpak/org.debios.PowerBrowser.json:9-17), so ~/.orca, ~/.agents/skills, ~/.claude/settings.json and ~/orca/workspaces will not be reached. Add persist entries, grant home access, or ship no Orchestration mode in Flatpak?
9. Agent status hooks: leave them on, which writes shared entries in ~/.claude/settings.json, or set agentStatusHooksEnabled=false, which loses agent status in the mode?
10. Worktree root: keep ~/orca/workspaces, or set the web Settings host override, whose effect on orcad was not traced?
11. Trademark: a third party, Watson Holding Inc., has a pending USPTO ORCA application (serial 99670496, Classes 9/42) for AI agent-coordination software. This supports using "Orchestration" on PB surfaces and naming Orca only in credits. Get legal review?

## 8. Not checked

- No live run of the web client. Conclusions come from source, the built bundle and the spike screenshots.
- Which of the 1,262 catalog values containing 'Orca' are visible in the web client (only spot checks), and counts in non-English locales.
- Whether the web client gates off the crew panel titled "Orchestration".
- Every screen that shows the stored host name.
- Whether the host override hostSettingOverrides.defaultWorktreeLocation affects orcad worktree creation.
- Whether a plugin language pack can apply inside a headless orcad, including to server-side strings.
- Live behaviour of either injection route, the PB tab-label override, a prefixed /orchestration/ path, or an orca:// URL typed into PB's address bar.
- Whether the daemon-entry.js child inherits `--title`, and the live ps name of a PB-spawned orcad.
- Whether Claude Code, Codex, opencode or other TUIs act on TERM_PROGRAM=Orca.
- Whether PB orcad writes hook entries to the real ~/.claude/settings.json or to an Orca-managed profile directory, and whether skills auto-install on first start.
- Live egress of orcad and the web client, and whether the NG-069 egress preload covers orcad.
- Whether pointing ORCA_PUSH_GATEWAY_URL at an invalid origin disables push cleanly.
- Licences of orcad-template/node_modules and the bundled node runtime.
- Trademark facts were read from aggregator sites, not from USPTO directly. Non-US marks and Stably AI's brand guidelines outside onorca.dev were not checked.
- Source line numbers are from 1.4.214. Only the grepped strings and file layout were confirmed in the 1.4.245 build.
- macOS and Windows path variants.
- Whether /lib64 exists on the host outside the Orca FHS env; this session runs inside it.
- Keyboard-shortcut collisions between Orca bindings and Gecko-reserved keys.
## Owner decisions (Chris, 2026-11-04)

These override the recommendations above where they conflict.

1. **Mode name stays "Orca"**, and Orca tabs are "Orca tabs". The "Rename to Orchestration" list in section 2 is withdrawn. Renaming names and logos is cosmetic and deferred to a later milestone.
2. **Landing logo:** replace Orca's logo in the main landing area with the PowerBrowser logo, by injection.
3. **Data directory:** `powerbrowser-orca`, set through `ORCA_USER_DATA`. This follows the `powerbrowser-theia` precedent.
4. **Injection route:** a JSWindowActor that loads a stylesheet and seeds settings. It needs a new `powerbrowser/INTERNAL-APIS.md` catalogue row and widens the "no DOM write" privilege row.

Still open: the tab URI scheme. Section 2's reason for avoiding `orca:` (it collides with Orca's `orca://pair` and the OS handler Orca desktop registers) still holds under decision 1, so the scheme needs a non-colliding name, e.g. `pb-orca:`.
