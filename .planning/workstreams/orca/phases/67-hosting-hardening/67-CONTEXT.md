# Phase 67: Hosting hardening - Context

**Gathered:** 2026-11-10
**Status:** Ready for planning (after the research items in P67-10, P67-14 and P67-29: registry files, header record, pairing-loss induction)
**Mode:** Smart discuss, auto mode (Chris 2026-11-09: "Claude takes the recommended answers, keeps going"). Every P67 decision is Claude's recommended pick; Chris may override any of them before the dependent work lands or in the end-of-milestone pass (59-CONTEXT D-18). This ruling replaces D-25's interactive discuss step for this phase.
**Amended 2026-11-10 by owner ruling D-31** (Orca terminals on Orca's own engine and view, side by side with Theia terminals): see "Amendments after D-31" (P67-32..P67-35).

<domain>
## Phase Boundary

Orca hosting fails in PowerBrowser's own words and keeps its secrets. When orcad dies, its port is taken or pairing is lost, each open hosted Orca tab shows a PowerBrowser page with a real next step, and every identifier the page omits is a diagnostics row (RUN-06). The pairing offer never reaches history, session restore, logs, the address field or copyable text, and a check proves it per sink (RUN-07). The Theia token gate rejects sidecar requests whose Origin is not PowerBrowser's own page (RUN-08). PowerBrowser refuses to start Orca with a temp-directory data root or the plaintext secret-store override, and states that protection is a same-user key file, not an OS keyring (RUN-09). Orca's landing logo becomes the PowerBrowser logo through a JSWindowActor gated on the orcad origin, with a catalogue row and a selector list per Orca version (INJ-01). Success criteria are the five in ROADMAP Phase 67.

Route fixed by Phase 64 (spike 004, Route A): Orca pane components run in an `OrcaPaneWidget` in the Theia document, paired through the offer file and Theia's authenticated RPC (P64-07). Two consequences carried from 64-CONTEXT "Corrections for the coordinator": the RUN-06 page renders inside `OrcaPaneWidget`, and Orca's landing page is never shown in the Theia document, so INJ-01 applies only to orcad-origin documents (P67-22).

Depends on Phases 64, 65 and 66 being merged, not only planned: `OrcaPaneWidget`, the offer file and offer RPC (P64-06, P64-07), the `pb-orca:` addresses (TAB-02), re-pairing and Setups restore across a relaunch (TAB-08, Phase 65), and browser panes as PB web tabs (BRW-02, Phase 66). Picks that depend on an outcome of those phases are marked **Depends on 6x**.

Out of scope: packaging, the three-OS artifacts and Windows file ACLs (Phase 68); renames and logos beyond the landing logo (DECISIONS "Earlier decisions": cosmetic, deferred); Orca's own settings and sidebar (TAB-07, Phase 65); any change to orcad's mobile-facing protocol (D-23).

</domain>

<decisions>
## Implementation Decisions

### Failure page and copy (RUN-06, criterion 1)
- **P67-01 (Claude's pick): the page renders inside each hosted `OrcaPaneWidget`; local Orca terminals keep Theia's own exit display.** A hosted pane hides its pane root and shows the PowerBrowser page in its place; on recovery it shows the pane again. Orca's own connection and "Unauthorized. Pair this web client again." states (`orca/src/renderer/src/web/web-runtime-client-error.ts:27-45`) are never shown while the page is up. A local terminal is a Theia `o<n>` tab whose PTY lives in Theia's backend (P63-10: the tab stays open showing the exit), so a PB page there would contradict the terminal's real state. Reason: 64-CONTEXT correction ("renders inside `OrcaPaneWidget` under Route A"). **Depends on 64:** a content type that P64-03 research moved to Route B' shows the same component in the Theia half of its web-tab widget with the overlay browser hidden.
- **P67-02 (Claude's pick): seven failure classes, one exported copy table and one affordance table in the orca-panes extension.** Several causes collapse onto one sentence where the user's action is the same (the TheiaService rule, `powerbrowser/shell/TheiaService.sys.mjs:29-32`). Each sentence names PowerBrowser, states the problem plainly and ends with an affordance rendered on the page (`.planning/milestones/v1.0-phases/01-platform-extraction-and-rename/01-UI-SPEC.md` copywriting contract):

  | Class | Causes | Copy | Buttons |
  |---|---|---|---|
  | `restarting` | orcad exited and the supervisor is starting it again (`OrcaService._supervise`, `OrcaService.sys.mjs:430-450`) | "PowerBrowser's Orca server stopped and is starting again. This tab comes back when it is ready; open Details if it doesn't." | Details |
  | `could-not-start` | give-up after `giveUpAttempts`, startup timeout, Node too old, non-loopback bind, unexpected error | "PowerBrowser couldn't start Orca. Choose Restart Orca, or open Details to see the error." | Restart Orca, Details |
  | `port-in-use` | `pinned_port_unavailable`, `orcad_instance_lock_held` (`OrcaEnv.sys.mjs:72-73`) | "PowerBrowser couldn't start Orca because another program is using the connection Orca needs. Close other copies of Orca, then choose Restart Orca, or open Details." | Restart Orca, Details |
  | `files-missing` | orcad entry file or web client root absent | "PowerBrowser can't find its Orca files. This build looks incomplete — reinstall, or open Details for the missing path." | Details |
  | `temporary-profile` | RUN-09 temp-root refusal (P67-16) | "PowerBrowser won't start Orca from a temporary profile, because Orca would keep your sign-ins there without protection. Open PowerBrowser with a regular profile, or open Details." | Details |
  | `plaintext-setting` | RUN-09 override refusal (P67-17) | "PowerBrowser won't start Orca while a setting asks it to save sign-ins without encryption. Remove that setting and restart PowerBrowser, or open Details to see its name." | Details |
  | `pairing-lost` | Orca client auth failure (`WebRuntimeAuthFailureReason`: `unauthorized`, `device-revoked`, `device-downgraded`, `insecure-origin`, `web-runtime-client-error.ts:3-7`), pairing unavailable at orcad start (`PairingOfferUnavailableReason`, `orca/src/main/runtime/runtime-rpc/runtime-rpc-pairing-types.ts:56-62`), offer file refused (P67-09) | "PowerBrowser lost its connection to Orca's server. Choose Reconnect, or open Details if this keeps happening." | Reconnect, Details |

  The two RUN-09 pages carry the protection statement of P67-18 as a second line. Wording is the planner's to polish within the contract; the class set, the causes and the buttons are the pick.
- **P67-03 (Claude's pick): chrome classifies orcad failures, the frontend classifies client failures, through one pure mapping.** `OrcaEnv.failureClassOf({ step, code })` (pure, so the check imports it, as P62-04's helpers are) maps OrcaService's failed step and failure code to a class; `OrcaService.getState()` gains `failureClass`. The frontend maps Orca's client reasons to `pairing-lost`. A cause with no mapping is `could-not-start`, never silence.
- **P67-04 (Claude's pick): the frontend reaches chrome through three new kinds on the existing PowerBrowserGroup actor's shell table (`SHELL_MESSAGE_KINDS`, `PowerBrowserAPI.sys.mjs:302`), behind the existing sender wall (`groupSenderIsTheia`, `:317`).**
  - `orcaStatus`: replies `{ state, failureClass }` and nothing else; it accepts an optional client reason, validated against the closed reason set, which OrcaService records as the diagnostics row "Orca pairing failure".
  - `orcaRestart`: calls `OrcaService.restart()` (P67-06).
  - `orcaShowDiagnostics`: opens the shell's existing diagnostics layer (`window.powerbrowserShowDiagnostics`, `powerbrowser/shell/powerbrowser.js:267-324`).

  No identifier crosses to the frontend, so the frontend's copy cannot carry one. Reason: the actor is the only frontend-to-chrome channel (`theia/extensions/tab-uris/src/browser/browser-window-command.ts:55-80`); a status file plus a Theia RPC would still need the actor for Restart and Details. The wire names and reply shape are fixed in the plan's interfaces block so the chrome lane and the frontend lane code against them in parallel.
- **P67-05 (Claude's pick): every identifier the copy omits is a row in the chrome diagnostics layer, through `OrcaService.getDiagnosticRows()`, which that layer already renders (`powerbrowser.js:303-314`).** Rows already there: Orca state, port, process ID, terminal daemon, data root, failed step, error, exit code, failure code, start attempts, startup timeout, Node.js version, bound address (`OrcaService.sys.mjs:556-579`, `:380-403`). New rows: "Orca restart count", "Orca entry file" (files-missing), "Orca temporary folder" (the temp root matched, P67-16), "Orca setting" (the override's name and value, P67-17), "Orca pairing failure" (the client reason, P67-04), "Orca credential key folder" (P67-19). Every row passes `OrcaEnv.redact` as `_pushLog` does today. No row carries the offer, the device token or a credential.
- **P67-06 (Claude's pick): Restart Orca and Reconnect do the same work the product already does.** `OrcaService.restart()` runs only in the `failed` state: it resets the attempt count, reaps as the launch path does (`_reapLeftover`), re-runs the RUN-09 preflight and calls `_launch()`. In `starting`, `ready` or `stopped` it logs one line and does nothing. The two RUN-09 classes and `files-missing` render no Restart button, because a restart cannot change their outcome (the 01-13 rule: the stated next step and the rendered controls are one fact). Reconnect re-reads the offer over the P64-07 RPC and passes it to Orca's own `parseWebPairingInput` / `saveStoredWebRuntimeEnvironment` (`orca/src/renderer/src/web/web-pairing.ts:26-41`, `web-runtime-environment.ts:84-101`). **Depends on 65:** after a relaunch, Reconnect uses the re-pairing path TAB-08 builds; if 65 lands that path as a function, Reconnect calls it rather than repeating it.
- **P67-07 (Claude's pick): the page polls `orcaStatus` once a second while it is shown and hides itself when the state is `ready` and the client has reconnected.** Reason: the same shape as TheiaService's recovery probe (`_startRecoveryProbe`); orcad restarts take seconds, and a push channel from chrome to the frontend does not exist.

### Pairing-offer containment (RUN-07, criterion 2)
- **P67-08 (Claude's pick): the offer may live in exactly five places; every other place is a sink.**
  1. OrcaService memory while the ready line is parsed (`OrcaEnv.createOutputSink`, `OrcaEnv.sys.mjs:205`; stdout is never logged, `OrcaService.sys.mjs:12-13`).
  2. The 0600 offer file in the 0700 `pty-bridge` folder (P64-07).
  3. Theia backend memory and one reply on Theia's authenticated JSON-RPC.
  4. Orca's own storage in the Theia origin: localStorage key `orca.web.runtimeEnvironment.v1` (`web-runtime-environment.ts:34`) and the in-memory store (owner item T-61-04, P64-07).
  5. orcad's own data-root files that Orca's source names as its device registry, derived at check time (P67-10 research item).

  Sinks: any URL (history, address field, session restore, Setups), environment variable, log line, title, clipboard text, file in the profile, and file in the bridge folder other than the offer file.
- **P67-09 (Claude's pick): harden the two PB-owned holders.**
  - `PowerBrowserProcesses.writePrivateFile` (Phase 63, `ServerDestroyer/p63-05`) creates the folder 0700 only when it is absent (`IOUtils.makeDirectory(..., { ignoreExisting: true, permissions: 0o700 })`), and the file is written through a temporary sibling at the umask's mode before it is set to 0600. Phase 67 re-applies 0700 to the folder on every call, so the folder's mode is the barrier during that window.
  - The Theia backend reads the offer file with `lstat` first and refuses a symlink, a non-regular file, any group or other permission bit, or an owner other than its own uid (Linux and macOS; Windows ACLs are Phase 68).
  - It decodes the offer and refuses one whose endpoint is not `ws://127.0.0.1:<orca port>`, using the same rule as `OrcaEnv.isLoopbackEndpoint` (`OrcaEnv.sys.mjs:161-163`).
  - A refusal shows `pairing-lost`, with a diagnostics row naming the reason and never the value.
  - OrcaService removes the offer file on stop, as it removes the data-root file (p63-05 `stop()`).
- **P67-10 (Claude's pick): one scanner, `scripts/verify-orca-pairing-containment.mjs`, with needles derived from the offer orcad issued.** The live run reads the offer file once. Needles: the raw code; its URL-encoded form; the `orca://pair?` form; the `#pairing=` fragment; and the decoded `deviceToken`, decoded as Orca's `decodePairingPayload` does (`web-pairing.ts:26-41`; the offer shape is `WebPairingOffer`, `:11-19`). Collectors, one per sink:
  - **History:** `places.sqlite` read through `node:sqlite` on a copy, plus the raw bytes of `places.sqlite-wal`.
  - **Session restore:** `sessionstore.jsonlz4` and `sessionstore-backups/*`, decompressed by a small mozlz4 block decoder in `scripts/lib/`.
  - **Setups and shell state:** `powerbrowser-shell-state.json` (`PowerBrowserAPI.sys.mjs:303`).
  - **Logs:** captured PB stdout and stderr with the Theia console mirrored (`devtools.console.stdout.content`), the OrcaService and TheiaService ring buffers as the diagnostics layer renders them, and orcad's data root except the derived registry files. Research names the registry files at the pin: `device_registry_unavailable` in `runtime-rpc-pairing-types.ts:58` shows that one exists.
  - **Address field:** the chrome bar's address text for every open Orca tab and for the control web tab.
  - **Copyable text:** the diagnostics layer's rendered rows and log, which are exactly what Copy diagnostics joins (`powerbrowser.js:336-342`), and the tab-address copy for every Orca tab. The OS clipboard is not read, because what it holds depends on the environment.
  - **Whole profile:** a byte scan of every profile file, excluding only the Theia origin's storage folder (holder 4).
  - **Bridge folder:** wrong modes (every file 0600, the folder 0700, owned by the user) and stray copies (any file other than the offer file that holds a needle).
  - **Non-loopback peer:** the decoded endpoint is loopback, and on Linux every listening socket of orcad's and the Theia backend's PIDs is bound to loopback (`/proc/net/tcp` and `/proc/net/tcp6` by socket inode).
- **P67-11 (Claude's pick): every collector proves it can see before an absence is judged (CLAUDE.md verification rule 1).** In the same live run, each collector first finds a harmless marker that travelled the same path:
  - **History, session restore and address field:** a marker URL loaded in a PB web tab.
  - **Copyable text:** the "Orca port" row.
  - **Logs:** OrcaService's "orcad ready on" line.
  - **Bridge folder and the needle encodings:** the offer itself, found in the offer file by the same byte scanner.

  A collector whose control is not found goes red as "collector blind", never green. localStorage is not used as a control: Gecko may store its values compressed, so a byte scan there proves nothing.
- **P67-12 (Claude's pick): the `--self-test` plants the offer in each sink of a fixture profile and requires each plant to go red naming its sink.** The plants:
  - a `moz_places` row, a WAL page and a compressed session file;
  - a Setups record, a log text and an address text;
  - a diagnostics text and a 0644 offer file in a 0755 folder;
  - an offer whose endpoint is `ws://192.168.1.5:26768`;
  - an offer in an orcad data-root file outside the registry;
  - a stray copy in the bridge folder;
  - a blind collector, which removes the control marker and must go red as "collector blind".

### Sidecar Origin gate (RUN-08, criterion 3)
- **P67-13 (Claude's pick): the token gate rejects a request in either of two cases, before the cookie is compared; every other request goes on to today's token check.** This runs inside `gate()` and `allowWsUpgrade()` (`theia/extensions/token-gate/src/node/token-gate-backend-contribution.ts:149-166`, `:192-199`). The two rejected cases:
  1. It carries an `Origin` other than exactly `http://127.0.0.1:<bound port>`. `null` counts as foreign.
  2. Its `Sec-Fetch-Site` is `same-site` or `cross-site`.

  Why both: the token cookie is host-only on `127.0.0.1` with SameSite=Lax (`PowerBrowserAPI.sys.mjs:540-575`). Two loopback ports are the same site, so a page on orcad's port 26768 sends the cookie with its subresource requests. A no-cors GET carries no `Origin`, which is why `Sec-Fetch-Site` is checked as well.
  - The allowed origin is built from the bound address in `announce()`, never from a list.
  - The webview-host branch keeps running first and is unchanged.
  - With `POWERBROWSER_TOKEN_DISABLE=1` the gate is not installed, as today.
  - The rule is one pure function in `theia/extensions/token-gate/src/common/origin-policy.ts`, beside `webview-host.ts`.
- **P67-14 (Claude's pick, research gate): before the rule is fixed, research records `Origin` and `Sec-Fetch-Site` for each request class of PowerBrowser's own pages in one live run, and the rule admits each class by its observed header pair.** The classes:
  - the Theia document load, its fetch/XHR and its WebSocket;
  - the chrome health probe, an XHR with the system principal (`PowerBrowserAPI.sys.mjs:685-706`);
  - the webview shell files;
  - the Orca pane bundle served by Theia (P64-06);
  - Theia's service worker.

  The recording is temporary instrumentation in research, never a product log line. Reason: whether Gecko sends `Sec-Fetch-*` for `http://127.0.0.1` and for system-principal requests is an assumption here, unverified.
- **P67-15 (Claude's pick): keep both layers.** The chrome cookie strip (`tokenCookieAllowed`, `PowerBrowserAPI.sys.mjs:6298-6310`) removes the token only from requests whose top browsing context is a PB web-tab overlay. A stock-window page on another loopback port, a worker with no browsing context, or a future regression of the strip still sends it. The server rule does not depend on chrome. Under Route A, Orca's code runs inside the Theia origin itself, which no Origin rule can separate (owner item T-61-04, unchanged).

### Credential storage (RUN-09, criterion 4)
- **P67-16 (Claude's pick): OrcaService refuses before it spawns orcad when either the real data root or the effective root (the alias), resolved through `realpath`, lies inside a temporary folder.** Temporary folders per OS:
  - **Linux:** Gecko's `TmpD`, `$TMPDIR`, `/tmp` and `/var/tmp`.
  - **macOS:** `TmpD` (`/var/folders/.../T`), `/tmp` (→ `/private/tmp`) and `/var/tmp` (→ `/private/var/tmp`).
  - **Windows:** `TmpD`, `%TEMP%` and `%TMP%`.

  The rule is a pure function in OrcaEnv. Gecko's temp folder is read through one new `PowerBrowserAPI` method with an `INTERNAL-APIS.md` row. Reason: Orca's own test (`isTemporaryKeyDir`, `orca/src/main/orcad/orcad-secret-key-record.ts:101-114`, called at `orcad-secret-key-resolution.ts:163-168`) sees only orcad's `ORCA_USER_DATA`. That is the alias under `$XDG_RUNTIME_DIR` when the profile path is long (P62-19), so a profile under `/tmp` can pass Orca's test while its data is still disposable. Orca's response is to store plaintext; PowerBrowser's is to refuse.
- **P67-17 (Claude's pick): OrcaService refuses when PowerBrowser's own environment holds the plaintext override, `ORCA_HEADLESS_SECRET_STORE=plaintext` (`orcad-secret-protection-gap.ts:1`; trigger at `orcad-secret-key-resolution.ts:159`).** The name and the value are derived from the pin by the check. The name can never reach orcad, because it is not in `ORCAD_ENV_ALLOWLIST` (`OrcaEnv.sys.mjs:33-59`) and `buildOrcadEnv` copies only that list. The refusal makes the setting visible rather than silently dropped, and criterion 4 requires it. Other values are scrubbed and ignored, as Orca ignores them.
- **P67-18 (Claude's pick): the protection statement is one sentence in two places.** The sentence: "PowerBrowser protects Orca sign-ins with a key file that only your user account can read, not with your system's keyring." The places:
  - the second line of the two RUN-09 refusal pages;
  - a paragraph in `website-staging/privacy.html`, marked `data-orca-credential-protection`.

  Reason: the pinned orcad writes only `backend: 'host-file'` records (`orcad-secret-key-resolution.ts:64-73`, `:87-93`; a keyring record is migrated to a file, `:76-112`), so the sentence is true at the pin, and the check ties it to that source (`orca-credential-store`, P67-29).
- **P67-19 (Claude's pick): record, do not change, two facts the refusal does not cover.**
  - The key folder is `~/.orca` (`orcadCredentialRoot`, `orcad-plaintext-credential-migration.ts:42-44`), outside the data root. PowerBrowser's orcad shares it with any other headless orcad the user runs. Moving it needs a HOME change (rejected by P62-14) or a seam.
  - Orca's `unavailable` state (an unreadable key record, or a machine-ID mismatch) is not refused by PB: Orca keeps the sealed credentials and refuses new ones itself (`describeOrcadSealingUnavailable`, `orcad-secret-protection-gap.ts:26-32`).

  Both are diagnostics rows ("Orca credential key folder") and lines in the phase SUMMARY.
- **P67-20 (Claude's pick): the live proof reads orcad's own report, `<data root>/orca-secret-protection.json` (`orca/src/main/host/secret-protection-report.ts:17-19`, written at startup by `orcad-secret-store-startup.ts:4-13`).** It compares the report with strings got by evaluating the pinned `describe*` functions (transpiled with `theia/node_modules/typescript`, P63-27's rule). This corrects research T-8 (`research/FEATURES.md`), which advised matching on null or non-null: the ready state always reports the host-key gap (`orcad-secret-key-resolution.ts:150`), so null never occurs on a working profile.
- **P67-21 (Claude's pick): `makeProfile` in `scripts/lib/pb-relaunch.mjs:249-251` moves its profiles from `os.tmpdir()` to a repo-local ignored folder under `.mozbuild/`, as `verify-orca-service-live.mjs:77` already does.** Without the move, every live row that starts orcad would hit the P67-16 refusal. Disposal is unchanged.

### Landing logo (INJ-01, criterion 5)
- **P67-22 (Claude's pick): the actor applies to orcad-origin documents only, and the plan states which ones exist.** Under Route A, Orca's app shell, and with it `Landing` (`orca/src/renderer/src/app-shell/AppWorkspaceShell.tsx:106-108`), is never mounted in the Theia document. The orcad-origin documents are:
  - a Route B' pane page;
  - orcad's address opened in a PB web tab;
  - orcad's address opened in a stock window.

  **Depends on 64** (whether any type moved to Route B') **and 66** (browser panes as PB web tabs).
- **P67-23 (Claude's pick): one new actor pair, `PowerBrowserOrcaLogo`, registered from inside `registerGroupActor` as the EditState pair is (`PowerBrowserAPI.sys.mjs:2267-2292`; INTERNAL-APIS rows 109-110).** `registerGroupActor` stays the one registration method.
  - The child is a class in `GroupActorChild.sys.mjs`, the one child file the boundary guard exempts (`scripts/check-internals-boundary.sh:30`, `:114-115`). It adds no import and no privileged global: the guard allows only `wrappedJSObject` and `JSWindowActorChild` there, so the child cannot read prefs.
  - `matches: ["http://127.0.0.1/*"]`; `MatchPattern` cannot carry a port (NG-038 note, `PowerBrowserAPI.sys.mjs:288-293`).
  - On `DOMContentLoaded`, the child sends one query. The parent answers only when the sender's document port equals OrcaService's port and the embedder is not the shell's Theia browser. The answer is the mark data URI and the selector list for the pinned Orca version; every other sender gets `null`.
  - The child watches with a `MutationObserver` for at most 10 s (`Landing` is a lazy chunk), sets `src` and `alt` ("PowerBrowser logo") on the one matched element, then disconnects.
  - Orca's `web-index.html` declares no CSP (the desktop `index.html` does), so a `data:` image loads.
- **P67-24 (Claude's pick): the selector list is a constant in `OrcaEnv.sys.mjs`, keyed by Orca version.** The first entry is `{ "1.4.248": ["div.size-20.rounded-2xl > img.size-12"] }`, from `Landing.tsx:258-267` and the built `out/web/assets/Landing-*.js`, where `src` is an inlined `data:` URL from `App-*.js` and therefore not a stable selector. Parent and checks read the same definition, as P62-04 set up. A version with no entry gets no injection, one log line and a diagnostics row ("Orca logo selectors"), never a guess.
- **P67-25 (Claude's pick): the logo is `brand/mark.svg`, packaged by one `jar.mn` line, never copied into the tree.** The parent reads it once through its chrome URL and builds the `data:` URI. The live row compares the injected `src` with `brand/mark.svg` bytes. Reason: `brand/` and `configuration.toml` are the only rebrand inputs, and `scripts/verify-branding-preflight.mjs:609-637` already guards the mark's one restatement (`POWERBROWSER_MARK_SVG`). A second copy would need a second guard.
- **P67-26 (Claude's pick): `INTERNAL-APIS.md` gains three rows:** the new `registerWindowActor` line; the new `JSWindowActorChild` class line; and the widened "DOM write" for that child, which sets two attributes on one element of an orcad-origin document. Research T-11 named the last row ("the 'no DOM write' privilege row widens").

### Egress
- **P67-27 (Claude's pick): no new host.** The logo is packaged, the Origin gate and the refusal are local, and the failure page fetches nothing. `privacy-hosts` and `theia-endpoints` stay unchanged; the privacy-page paragraph of P67-18 is prose, not a `data-*-host` element. One recorded fact: a rendered `Landing` asks orcad whether the user starred Orca on GitHub (`landing-github-star-state.ts:14`, through `gh`). That is Orca's behaviour on an orcad-origin page, not added by PB. The logo live row runs with `gh` absent from the orcad environment's PATH and records that no such call was made.

### Seams
- **P67-28 (Claude's pick): zero new seam patches.** Every Phase 67 change is a PowerBrowser file: chrome, a Theia extension, scripts, or the privacy page. The overlay keeps 3 landed seams (010 from Phase 62, 020 and 030 from Phase 63) and 2 planned (070 and 080, Phase 68): 5 of the 10-seam cap (D-16, P62-17). `orca-overlay` and `orca-overlay-built` run unchanged.

### Checks (one registry, derive and compare)
- **P67-29 (Claude's pick): each check is one row plus a `-self-test` row in `scripts/verify-platform.sh`, with expectations derived from the pinned Orca source or the tree and compared as sets.** Quick rows print a named SKIP and exit 0 when `orca/` or the build they read is absent (P62-10). Live rows run under `flock /home/chris/coding/Power-Browser/.git/pb-live.lock` with caches purged.
  - `orca-failure-classes` and its self-test (quick). Derives the failure codes (`OrcaEnv` constants), OrcaService's failed-step strings (`_fail(` and `step:` sites parsed from `OrcaService.sys.mjs`), `WebRuntimeAuthFailureReason` and `PairingOfferUnavailableReason` (TypeScript parse of the pinned files, P63-27's parser rule). Requires each to map to exactly one class through `failureClassOf` or the frontend map, and the class set to equal the copy table's and the affordance table's keys. Plants: an added Orca reason, a removed class, a class with no copy, an unmapped step.
  - `shell-error-copy-no-internals`, extended rather than added. `scripts/verify-shell-error-copy.mjs` gains an Orca scope, as its 14-02 modes extension did:
    - the orca-panes copy table, derived from the file, passes the existing shape test (all-caps tokens, dotted keys);
    - every render site resolves to the table;
    - each sentence names a button ("Restart Orca", "Reconnect", "Details") exactly when the affordance table renders it.

    Its self-test gains the matching plants (a leaked failure code, an ad-hoc literal, a sentence naming a button the class does not render).
  - `orca-failure-page-live` (live). Induces three failures, and before each one the collector first reads the hosted pane's own content in the widget, the positive control:
    - `kill -9` of orcad: shows `restarting`, then the pane returns;
    - a listener pre-bound on the Orca port before launch: shows `port-in-use`; Details opens the chrome layer with "Orca failure code"; Restart Orca after the listener closes shows the pane;
    - lost pairing: shows `pairing-lost`, and Reconnect shows the pane. Research picks the induction (revoking the device through orcad's runtime RPC or CLI, or removing the registry entry) from the pinned source.

    Every page text equals a table value.
  - `orca-pairing-containment` self-test (quick, fixtures, P67-12) and `orca-pairing-containment-live` (live, P67-10, P67-11). The live session pairs, opens a hosted chat tab and the marker web tab, opens diagnostics, saves a Setup, quits, then scans.
  - `sidecar-origin-gate` and its self-test (quick). Runs the pure policy over a derived case table: the PB origin, orcad's origin, another loopback port, `null`, `http://127.0.0.1.evil.com:<port>`, each `Sec-Fetch-Site` value, and no headers. The self-test inverts each expected outcome in turn and requires red naming the case.
  - `sidecar-origin-gate-live` (full, needs the built Theia, no browser). Starts the sidecar standalone with a known test token through the existing handshake, sends `/powerbrowser/health` and a WebSocket upgrade with the token cookie, and requires 200 or accept for the PB Origin, 403 or refuse for orcad's Origin, 403 for `Sec-Fetch-Site: same-site` with no Origin, and 200 for `none`. Criterion 3's "opposite outcome for each" is the first pair. That PB's own pages are still served is proven by the existing live rows, which the coordinator re-runs (Theia boot, webviews, the pane bundle).
  - `orca-credential-store` and its self-test (quick). Derives from the pin the override's name and trigger value, the temp roots `isTemporaryKeyDir` uses, and the record backends `newFileRecord` and the migration write. Compares them with OrcaEnv's constants (PB's root set must contain Orca's). Requires the override's name to be absent from `ORCAD_ENV_ALLOWLIST`, and requires the privacy-page statement to be present while the only written backend is `host-file`. Plants: a renamed override, an added Orca temp root, the name added to the allowlist, the statement removed, a keyring backend written.
  - `orca-credential-store-live` (live). Four steps:
    1. Positive control: built orcad, run through `scripts/lib/orca-run.mjs` with a data root under `/tmp`, reports the disposable-profile string.
    2. PB with a normal profile: orcad starts, and the report equals the host-key string.
    3. PB with a profile under `/tmp`: no orcad process in PB's tree, state class `temporary-profile`, and the "Orca temporary folder" row is present.
    4. PB with the override set: class `plaintext-setting`, and the "Orca setting" row is present.

    The no-process assertion in step 3 follows step 2's proof that the same harness sees orcad start.
  - `orca-landing-selectors` and its self-test (quick, SKIP without the build). The selector constant has an entry for the version pinned in `configuration.toml`, and each class token of that entry occurs in the built `Landing-*.js`. Plants: a missing version entry, a token absent from the bundle.
  - `orca-landing-logo-live` (live). orcad's address in a PB web tab with a fresh data root renders `Landing`. Positive control: the same page reached through a loopback proxy on a second port, where the actor's port gate does not apply, shows exactly one matched element whose `src` is Orca's logo. Then, on orcad's own port, the one matched element's `src` decodes to `brand/mark.svg` and its `alt` is the PB text. The Theia document is unchanged (its DOM has no injected attribute).
  - Extended, not new: `verify-orca-service.mjs` scenarios for `failureClassOf`, `restart()` and the preflight; `verify-orca-bridge-dir.mjs` for the re-applied folder mode; `internals-boundary` and `internals-catalogue` for the new rows; `verify-registry-shape.mjs` and `gui04-registry-shape` unchanged and green.
- **P67-30 (Claude's pick): no new user-facing copy beyond the seven sentences, the protection sentence, the three button labels and the logo's alt text.** Everything else is a log line or a diagnostics row.

### Mechanics and lane cut
- **P67-31 (Claude's pick): four lanes with disjoint files, then a coordinator plan.**
  - **p67-01 (wave 1, chrome and RUN-09):**
    - code: `powerbrowser/shell/OrcaService.sys.mjs` (`failureClass`, `restart()`, the preflight, the client-reason row, removing the offer file on stop) and `OrcaEnv.sys.mjs` (`failureClassOf`, the temp-root rule, the override name and value);
    - boundary: `PowerBrowserAPI.sys.mjs` (the three shell kinds, the temp-folder method, the `writePrivateFile` folder mode) and `powerbrowser/INTERNAL-APIS.md` rows for those;
    - other edits: `powerbrowser/shell/powerbrowser.js` (the diagnostics opener for `orcaShowDiagnostics`), `website-staging/privacy.html` and `scripts/lib/pb-relaunch.mjs` (`makeProfile`, P67-21);
    - checks: `scripts/verify-orca-failure-classes.mjs`, `scripts/verify-orca-credential-store.mjs`, `scripts/verify-orca-credential-store-live.mjs`, the extensions to `verify-orca-service.mjs` and `verify-orca-bridge-dir.mjs`, and its registry blocks.
  - **p67-02 (wave 1, token gate):** `theia/extensions/token-gate/src/common/origin-policy.ts` and the two call sites in `token-gate-backend-contribution.ts`, `scripts/verify-sidecar-origin-gate.mjs`, `scripts/verify-sidecar-origin-gate-live.mjs`, and its registry blocks. It runs the P67-14 header recording first.
  - **p67-03 (wave 1, Theia failure page and offer reader):** `theia/extensions/orca-panes/**` (the page component, the copy and affordance tables, the client-reason map, the shell-kind client, the polling, the hardened offer reader of P67-09), the Orca scope in `scripts/verify-shell-error-copy.mjs`, `scripts/verify-orca-failure-page-live.mjs`, and its registry blocks. It codes against the interfaces block of P67-04.
  - **p67-04 (wave 1, containment scanner):** `scripts/verify-orca-pairing-containment.mjs`, `scripts/lib/mozlz4.mjs`, the fixture tree under `scripts/fixtures/`, and its registry blocks.
  - **p67-05 (wave 2, INJ-01, after p67-01 merges, because it edits the same chrome files):** the actor registration in `PowerBrowserAPI.sys.mjs`, the child class in `GroupActorChild.sys.mjs`, the selector constant in `OrcaEnv.sys.mjs`, the `jar.mn` line for `brand/mark.svg`, three `INTERNAL-APIS.md` rows, `scripts/verify-orca-landing-selectors.mjs`, `scripts/verify-orca-landing-logo-live.mjs`, and its registry blocks.
  - **p67-06 (coordinator):**
    1. Merges 01..04 in that order, then 05, each by `refs/heads/<branch>`.
    2. Rebuilds Theia (audited install, `docs/BUILD.md`) and PowerBrowser. `jar.mn` changes, so this is `./mach build faster`, and chrome JS edits need `-purgecaches`.
    3. Re-runs every existing live row that loads the Theia document before judging the new ones (the Origin gate must not refuse a PB page).
    4. Runs the new live rows, re-measures brand rows, updates tracking and records the Deferred Verification table.

  The expected conflicts are textual: the lanes' registry blocks. Only the coordinator edits `STATE.md`, `ROADMAP.md`, `REQUIREMENTS.md` tracking, `WINDOWS.md` and `inventory/brand-tokens.json`; nobody edits the ledger. Lanes stage their files and record their brand-scan report for the coordinator (new files naming Orca need rows, the 60-04 rule). Each lane runs in its own worktree. No human checks (D-18).

### Amendments after D-31 (coordinator, 2026-11-10; owner ruling, not an auto-mode pick)
Source: `DECISIONS.md` D-31, 63-CONTEXT P63-31..P63-40, 64-CONTEXT P64-30..P64-36. Picks above keep their text; these win over them.

- **P67-32 (amends P67-01): Orca terminal tabs get the failure page like every hosted pane.** After D-31 an Orca terminal is a hosted `TerminalPane` in an `OrcaPaneWidget` (P64-30), not a Theia `o<n>` tab with a Theia-owned PTY, so P67-01's exception for local terminals is gone: when orcad dies, its port is taken or pairing is lost, a terminal tab shows the same PowerBrowser page in its pane root and recovers like the others. Its PTY lives in Orca's terminal daemon, which `OrcaService` stops with orcad (D-07).
- **P67-33 (amends P67-09; 63-CONTEXT P63-36): `writePrivateFile` already has no umask window and re-applies the folder mode when Phase 67 starts.** Lane p63-06 lands 67-RESEARCH A-11's body (folder 0700 re-set on every call, exclusive empty `.tmp`, 0600 before content, overwrite write, move) and `verify-orca-bridge-dir.mjs` checks the call order statically. Phase 67 does not edit `writePrivateFile`; P67-09 keeps the offer file's own hardening (lstat, regular file, own uid, no group or other bits) and the hardened offer reader. 67-RESEARCH's citations of `ServerDestroyer/p63-05 PowerBrowserAPI.sys.mjs:11018-11027` refer to code that is never merged; read the v1.7 branch after the 63-04 merge instead.
- **P67-34 (renames, P63-35):** every "`pty-bridge` folder" and "bridge folder" reference means lane p63-06's bridge folder (`<XDG_RUNTIME_DIR or HOME/.cache>/pb-orca-<12 hex>-bridge`, `POWERBROWSER_ORCA_BRIDGE_DIR`, `OrcaService.getState().bridgeDir`); `OrcaService` removes `orcad-data-root` on stop (lane p63-06) as the offer-file removal copies.
- **P67-35 (amends P67-28):** the overlay keeps 1 landed seam (010 from Phase 62; Phase 63 lands none after D-31) and 2 planned (070 and 080, Phase 68): 3 of the 10-seam cap.

### Claude's Discretion
- Exact sentence polish within the copywriting contract; the page's layout inside the widget.
- File layout inside orca-panes, and the name of the repo-local profile folder.
- The mozlz4 decoder's implementation and the fixture tree layout.
- The proxy used for the logo row's positive control.
- The polling interval's exact value.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

- `.planning/workstreams/orca/ROADMAP.md` Phase 67 (five criteria); `.planning/workstreams/orca/REQUIREMENTS.md` RUN-06, RUN-07, RUN-08, RUN-09, INJ-01.
- `.planning/workstreams/orca/DECISIONS.md`: D-04 and D-16 (overlay, seam cap), D-07, D-08, D-14, D-17 (Origin check), D-23 (mobile protocol untouched), the "Earlier decisions" landing-logo and `ORCA_USER_DATA` lines.
- `.planning/workstreams/orca/research/FEATURES.md` T-3, T-6, T-8 (corrected by P67-20), T-11; `.planning/workstreams/orca/ORCA-REBRAND-SURVEY.md`; `.planning/spikes/003-orca-headless-client-in-pb/README.md` (the client strips the `#pairing` fragment).
- Phase 64: `64-CONTEXT.md`: P64-06 (bundle served by Theia), P64-07 (offer file and RPC), P64-26 (no PB copy until this phase), P64-28, and "Corrections for the coordinator". Phase 63: `63-CONTEXT.md` P63-03, P63-10, P63-26, P63-27 (parser rule). Phase 62: `62-CONTEXT.md` P62-04, P62-10, P62-13, P62-16, P62-18, P62-19.
- `CLAUDE.md`: hard rules 1-3, verification rules (derive and compare; an absence only after its detector is proven), user-facing copy rule. `.planning/milestones/v1.0-phases/01-platform-extraction-and-rename/01-UI-SPEC.md`: copywriting contract.
- PB tree:
  - chrome: `powerbrowser/shell/{OrcaService.sys.mjs,OrcaEnv.sys.mjs,TheiaService.sys.mjs,PowerBrowserAPI.sys.mjs,GroupActorChild.sys.mjs,powerbrowser.js,jar.mn}`, `powerbrowser/INTERNAL-APIS.md`;
  - Theia: `theia/extensions/token-gate/src/{node/token-gate-backend-contribution.ts,common/webview-host.ts}`, `theia/extensions/orca-panes/**` (Phase 64);
  - scripts: `scripts/{verify-shell-error-copy.mjs,check-internals-boundary.sh,verify-orca-service.mjs,verify-orca-service-live.mjs,verify-orca-bridge-dir.mjs,verify-privacy-hosts.mjs,verify-branding-preflight.mjs,lib/pb-relaunch.mjs,lib/pb-live-probe.mjs,lib/orca-run.mjs}`;
  - other: `brand/mark.svg`, `website-staging/privacy.html`.
- Orca at the pin (`orca/`, v1.4.248):
  - credential store: `src/main/orcad/{orcad-secret-key-resolution.ts,orcad-secret-key-record.ts,orcad-secret-protection-gap.ts,orcad-secret-store.ts,orcad-secret-store-startup.ts,orcad-plaintext-credential-migration.ts,orcad-host-adapters.ts}`, `src/main/host/secret-protection-report.ts`;
  - pairing: `src/main/server/serve-readiness.ts`, `src/main/runtime/runtime-rpc/runtime-rpc-pairing-types.ts`, `src/renderer/src/web/{web-pairing.ts,web-runtime-environment.ts,web-runtime-client-error.ts}`;
  - landing page: `src/renderer/src/components/{Landing.tsx,landing-github-star-state.ts}`, `src/renderer/src/app-shell/AppWorkspaceShell.tsx`, `src/renderer/web-index.html`, built `out/web/assets/Landing-*.js`.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `TheiaService.sys.mjs` `USER_MESSAGE` table, `_showError` latch and the recoverable/unrecoverable split (01-13): the model for the Orca copy and affordance tables.
- `OrcaService.getDiagnosticRows()` and the shell diagnostics layer, which already renders Orca rows and offers Copy diagnostics.
- `OrcaEnv.redact`, `createOutputSink`, `isLoopbackEndpoint`: offer redaction, the stdout rule and the endpoint test, reused by P67-09 and P67-10.
- The PowerBrowserGroup actor's shell table and sender wall; the EditState pair as the pattern for a second pair registered from `registerGroupActor`.
- `verify-shell-error-copy.mjs`'s derived-table and shape tests and its 14-02 scope extension pattern.
- `verify-orca-service-live.mjs`'s repo-local profile folder (`.mozbuild/orca-service-live`).

### Established Patterns
- One registry (`scripts/verify-platform.sh`): one row plus one `-self-test` row per check; quick rows SKIP with a printed line when their input is absent; live rows take the live lock.
- Every Firefox internal is reached through `PowerBrowserAPI.sys.mjs` with an `INTERNAL-APIS.md` row in the same commit; `GroupActorChild.sys.mjs` is the one exempt child file.
- New chrome files or `jar.mn` lines need `./mach build faster`; chrome JS edits need `-purgecaches`.
- Pure decision code lives in `OrcaEnv.sys.mjs`, so a Node check imports the same definition the product runs.

### Integration Points
- The failure page mounts in `OrcaPaneWidget` (Phase 64) and talks to chrome only through the actor.
- The offer reader lives in the orca-panes backend contribution that serves the offer RPC (P64-07).
- The Origin rule sits in the token gate's early middleware and WebSocket validator.
- The RUN-09 preflight runs in `OrcaService.start()` after the data root and alias are resolved and before `_launch()`.

</code_context>

<specifics>
## Specific Ideas

- Each live absence (no offer in a sink, no orcad process, no page after recovery, no injection on a foreign port) follows a positive read through the same collector in the same run.
- No identifier reaches the frontend at all: `orcaStatus` returns a class, never rows.
- The protection sentence is tied to the pinned source by a check, so a future Orca keyring backend turns the row red instead of leaving the sentence false.

</specifics>

<deferred>
## Deferred Ideas

- Refusing or warning on Orca's `unavailable` key state (P67-19): recorded only.
- A separate credential key folder for PB's orcad: needs a HOME change or a seam (P67-19).
- Windows ACL checks for the bridge folder and the offer file, and the Windows temp-root live run (Phase 68, D-24).
- Renames and logos beyond the landing logo (DECISIONS: cosmetic, deferred).
- A chrome-to-frontend push channel for Orca status: polling suffices (P67-07).

### Owner decisions open (auto-mode picks Chris may override)
| Pick | What was decided | What an override changes |
|------|------------------|--------------------------|
| P67-17 | A plaintext override in PB's environment refuses Orca, although PB already keeps it from orcad | Ignoring it lets Orca start; the setting stays silently without effect |
| P67-18 | The protection sentence shows on the two refusal pages and the privacy page only | A persistent in-product place (for example the Orca side panel of Phase 65) adds a copy site |
| P67-19 | PB's orcad shares `~/.orca` as its key folder with any other headless orcad of the user | A separate folder needs a HOME change for orcad (rejected in P62-14) or a seam |
| P67-21 | Live-row profiles move out of `/tmp` for every check that uses `makeProfile` | A test-only pref that skips the temp-root refusal keeps them in `/tmp` and adds a bypass to the product |

### Corrections for the coordinator
- ROADMAP Phase 67 criterion 1 ("each open Orca tab shows a page"): it applies to hosted panes in `OrcaPaneWidget`; a local Orca terminal tab keeps Theia's exit display (P67-01, P63-10).
- ROADMAP criterion 5 and INJ-01: under Route A the actor serves orcad-origin documents only (P67-22, carried from 64-CONTEXT).
- `research/FEATURES.md` T-8: "match on null/non-null" does not distinguish anything, because a working profile always reports the host-key gap (P67-20).
- P67-21 changes where every `pb-relaunch.mjs` live row creates its profile; the coordinator re-runs the live rows that use it.
- P67-09 edits Phase 63's `writePrivateFile`; it lands after the Phase 63 merge.

### Deferred Verification (59-CONTEXT D-18)
| Item | Why deferred | Runs in |
|------|--------------|---------|
| The failure page reads well in an Orca tab, in light and dark themes, and its buttons are where a user looks | Visual and interaction check | End-of-milestone pass |
| The PB mark on Orca's dark landing tile is visible (the mark's dual fill follows the page's color scheme) | Visual check | Same |
| The protection sentence and the two RUN-09 sentences say what the owner wants said | Copy review | Same |
| Owner picks P67-17, P67-18, P67-19, P67-21 | Owner decisions | Same |

</deferred>

---

*Phase: 67-hosting-hardening*
*Context gathered: 2026-11-10 (auto mode); amended by owner ruling D-31 2026-11-10 (P67-32..P67-35)*
