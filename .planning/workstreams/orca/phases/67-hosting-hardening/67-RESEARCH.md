# Phase 67: Hosting hardening - Research

**Researched:** 2026-11-10
**Domain:** Gecko request headers and cookie scope on loopback, Theia 1.76 backend gating, Orca v1.4.248 credential store and device registry, JSWindowActor injection, chrome-side private file writes
**Confidence:** HIGH for the header record, the sidecar gap and the Orca pin facts (live run and source read this session); MEDIUM for items that depend on Phases 64-66 landing as planned.

<user_constraints>
## User Constraints (from 67-CONTEXT.md)

### Locked Decisions
P67-01..P67-31 are Claude's auto-mode picks (Chris 2026-11-09), locked unless disproved, and Chris may override any of them in the end-of-milestone pass. The full text is in `67-CONTEXT.md` `<decisions>`; it is not repeated here, because the planner reads that file directly and a second copy would drift. The groups are:
- Failure page and copy (RUN-06): P67-01..P67-07.
- Pairing-offer containment (RUN-07): P67-08..P67-12.
- Sidecar Origin gate (RUN-08): P67-13..P67-15.
- Credential storage (RUN-09): P67-16..P67-21.
- Landing logo (INJ-01): P67-22..P67-26.
- Egress, seams, checks, copy and lanes: P67-27..P67-31.

Every change this research makes to a pick is listed in **Context amendments** below, with its evidence.

### Claude's Discretion (verbatim)
- Exact sentence polish within the copywriting contract; the page's layout inside the widget.
- File layout inside orca-panes, and the name of the repo-local profile folder.
- The mozlz4 decoder's implementation and the fixture tree layout.
- The proxy used for the logo row's positive control.
- The polling interval's exact value.

### Deferred Ideas (OUT OF SCOPE, verbatim)
- Refusing or warning on Orca's `unavailable` key state (P67-19): recorded only.
- A separate credential key folder for PB's orcad: needs a HOME change or a seam (P67-19).
- Windows ACL checks for the bridge folder and the offer file, and the Windows temp-root live run (Phase 68, D-24).
- Renames and logos beyond the landing logo (DECISIONS: cosmetic, deferred).
- A chrome-to-frontend push channel for Orca status: polling suffices (P67-07).
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| RUN-06 | PB page with a real next step when orcad dies, its port is taken or pairing is lost; omitted identifiers become diagnostics rows | Pairing-loss induction from the pin (orca-devices.json edit, never a delete); `registry_unavailable` is a retry and never a failure; the ephemeral-key caveat for the `kill -9` scenario (Amendments A-7, A-13) |
| RUN-07 | The offer never reaches history, session restore, logs, the address field or copyable text | Registry file set derived from the pin for holder 5 (A-8); the write window in `writePrivateFile` and its minimal fix (A-11) |
| RUN-08 | The token gate rejects sidecar requests whose Origin is not PB's own | Live header record for every PB request class plus foreign pages; **the gap exists on main today and is an arbitrary file write**; the rule as an allow-list (A-1..A-3) |
| RUN-09 | Refuse a temp data root and the plaintext override; state the key-file protection | Gecko and Node temp folder resolution per OS; Orca's own test sees through the alias (A-4); report file and its strings (A-5); impact of moving `makeProfile` (A-6) |
| INJ-01 | Landing logo through a port-gated JSWindowActor with a selector list per version | Selector is unique in the built bundle at the pin; no CSP on orcad's web client; actor cost; observer lifetime (A-9, A-10) |
</phase_requirements>

## Summary

**Item 1: the gap exists on main today, and it is worse than a cookie leak.** A live run (probe kept in `probes/`) recorded at the sidecar the headers Gecko sends for each request class. A page on another `127.0.0.1` port, opened in a **stock window**, sent the `POWERBROWSER_TOKEN` cookie with its no-cors GET, its `<img>`, its top-level navigation and its multipart POST. The sidecar answered all of them with 200. The POST to Theia's `/file-upload` wrote a file at a path the page chose. [VERIFIED: live run, `upload-stock.txt written by the sidecar: true`.] Theia's own connection token does not stop this. It is `SameSite=Strict`, but two loopback ports are the same site, so it arrives too (`theiaCookie: true`). The chrome cookie strip covers overlays and workers but not stock windows, because `tabIdOfBrowser` returns null for a stock tab's browser. The token gate, the strip and Theia 1.76 are byte-identical between this branch and `main`, and the foreign page was a plain Node server, not orcad. So the hole is independent of Orca and has shipped since at least tag v1.5. Theia's own `WsOriginValidator` already refuses the cross-port WebSocket (status 400). The HTTP routes are what is open.

**The gate rule that blocks it without breaking Theia** is in the evidence below. Every legitimate PB request carried either no `Sec-Fetch-Site` header (the chrome health probe, which is an XHR under the system principal and has no `Origin` and no `Sec-Fetch-*` at all), or `none` (the shell's swap navigation into Theia), or `same-origin` (everything the Theia document, its workers and its WebSocket send). Every foreign request carried `same-site` or `cross-site`, and the CORS and WebSocket ones also carried the foreign `Origin`. The rule is therefore an allow-list:
- `Origin` is absent or exactly `http://127.0.0.1:<bound port>`;
- and `Sec-Fetch-Site` is absent, `same-origin` or `none`.

This tightens P67-13's deny-list, so an unknown future value fails closed.

The remaining items are settled from the pin and the tree:
- **Orca's own temp test sees through PB's alias,** because it realpaths. P67-16's decision stands, but its stated reason changes.
- **The report file** is `<ORCA_USER_DATA>/orca-secret-protection.json` holding `{"lastReportedGap": ...}`. The working-profile string has two variants.
- **Moving `makeProfile` out of `/tmp`** makes every live row exercise the alias path. It also needs the same move in `firefox-bidi.mjs`.
- **Pairing loss** can only be induced by editing `orca-devices.json`, never by deleting it. The pin has no headless revoke.
- **The landing selector** is unique in the built bundle, and orcad sends no CSP.
- **`writePrivateFile`'s umask window** closes with an IOUtils-only sequence: create the file empty and exclusively, chmod it, then write.

**Primary recommendation:** land `origin-policy.ts`, an allow-list on `Sec-Fetch-Site` plus an exact `Origin` match, in `gate()` and `allowWsUpgrade()`, as P67-13 places it. Because the hole is on `main` and stock windows ship today, the coordinator should raise it for a `main` fix (a carry-forward or hotfix ledger row) rather than wait for the v1.7 merge.

## Context amendments

Each amendment changes or corrects a pick. Picks not listed stand as written.

- **A-1 (P67-13, the rule's shape): use an allow-list, not a deny-list.** Reject when `Origin` is present and not exactly `http://127.0.0.1:<this.port>` (so `null` is foreign), **or** when `Sec-Fetch-Site` is present and not `same-origin` or `none`. If `this.port` is undefined, refuse (fail closed). Evidence: the live record below. Every PB class falls inside the allow-list, and every foreign request falls outside it. Behaviour changes worth stating in the plan:
  - a cross-site top-level navigation to the sidecar (a link on another site) now gets 403; today it gets 200 and boots a second Theia in a stock tab;
  - a same-site navigation from another loopback page also gets 403.

  Typing the sidecar URL in a stock window sends `none` and is still served.
- **A-2 (P67-14, the research gate): recorded in this session; one class is left for the coordinator.** The observed classes are in the header table below. Not recorded, and why:
  - **Webview shell files:** answered by the `isWebviewHost` branch before any token or Origin logic. P67-13 keeps that branch first and unchanged, so the rule never sees them.
  - **Theia's service worker:** none registered on the Theia origin in the run; Theia's only service worker is the webview one, on the webview host.
  - **The Orca pane bundle (P64-06):** not merged yet. Served by Theia to the Theia document, it falls in the same class as `/bundle.js` (`same-origin`, `no-cors`, `script`).

  The coordinator re-runs `probes/record-sidecar-headers.mjs` after the Phase 64 merge to confirm the pane bundle and its fonts or wasm land in `same-origin`.
- **A-3 (P67-15 and severity): keep both layers, fix the strip's comment, and escalate.** The strip comment says the token is kept "only for the Theia frame, chrome or a Theia-origin worker" (`PowerBrowserAPI.sys.mjs:6289-6291`). The code keeps it for any browsing context whose top embedder is not a web-tab overlay, which includes every stock window (`:6303-6306`, `tabIdOfBrowser` `:5577-5587`). The server rule is the fix. Correct the comment in the p67-01 lane, and do not tighten the strip in this phase: Theia windows opened through `window.open` are stock windows and would lose the token. **New:** the coordinator records that RUN-08's hole is live on `main` (Orca-independent, an arbitrary file write as the user) and proposes a `main` fix ahead of v1.7. Only the coordinator edits the ledger.
- **A-4 (P67-16, reason corrected; temp roots widened).** Orca's `isTemporaryKeyDir` realpaths its argument and tests both the lexical and the resolved path (`orcad-secret-key-record.ts:101-114`). A profile under `/tmp`, reached through the `$XDG_RUNTIME_DIR` alias, is therefore **detected** by Orca, which then stores plaintext ("Orca's response is to store plaintext; PowerBrowser's is to refuse" stays true). The sentence "a profile under `/tmp` can pass Orca's test while its data is still disposable" is wrong; drop it. The decision to refuse stands. Root set:
  - **Linux:** PB's set becomes Gecko `TmpD`, `$TMPDIR`, `$TMP`, `$TEMP`, `/tmp` and `/var/tmp`, each taken lexically and realpathed. Gecko's `TmpD` itself consults `TMPDIR`, then `TMP`, then `TEMP`, then `/tmp/`, and Node's `os.tmpdir()` uses the same order (both verified).
  - **macOS:** unchanged, plus realpaths (`/private/...`).
  - **Windows:** see Pitfall 6 (8.3 short names); Phase 68 runs it.
- **A-5 (P67-20, what the report file holds).** The file is `join(dirname(<ORCA_USER_DATA>/orca-data.json), 'orca-secret-protection.json')`, that is `<ORCA_USER_DATA>/orca-secret-protection.json`. Its content is `JSON.stringify({ lastReportedGap: gap })`, written only when the gap changed (the first start always writes). Through the alias it lands in the real data root. The live row compares `lastReportedGap` with the **set** of `describeOrcadHostKeyGap(true)` and `describeOrcadHostKeyGap(false)`, since `hostBound` depends on the machine ID being readable. A `pending` or `unavailable` string, or a missing file, is red, with the value named. The T-8 correction in P67-20 is confirmed.
- **A-6 (P67-21, scope):**
  - **Move `firefox-bidi.mjs`'s default profile as well.** `withFirefoxPage` makes its own profile under `os.tmpdir()` when no `profileDir` is given (`firefox-bidi.mjs:277`, `:372`), and 15 scripts call it directly. Use one repo-local base (for example `.mozbuild/pb-live-profiles/`) for `makeProfile`'s profile and config home and for both `firefox-bidi.mjs` defaults.
  - **New consequence:** with the repo path, the data root is always more than 84 bytes, so **every** live row now creates the `$XDG_RUNTIME_DIR/pb-orca-<12 hex>` alias, where a `/tmp` profile did not. `dispose()` must remove that link (derive it through `OrcaEnv.aliasPathFor`), or one stale link accumulates per run.
- **A-7 (P67-29, pairing-lost induction):** chosen from the pin.
  - **No headless revoke exists.** `revokeRuntimeAccess` and `revokeMobileDevice` are reachable only through Electron IPC (`src/main/ipc/mobile.ts:229-237`), and the web client's stub answers `{ revoked: false }` (`web-mobile-api.ts:16`). There is no CLI command.
  - **The induction:**
    1. Rewrite `<data root>/orca-devices.json` as valid JSON without PB's rows: the row whose `token` equals the offer's `deviceToken`, plus every row whose `parentDeviceId` or `forkedFrom` chains to it.
    2. Force a re-authentication with `kill -9` of orcad; the supervisor restarts it.
    3. The client's next handshake is refused. orcad adopts on-disk removals at every auth check (`device-registry.ts:204-207`, `:303-309`), and the client maps a refusal of its own device key to `device-revoked`, any other refusal to `unauthorized` (`web-runtime-auth-verdict.ts:26-42`). Both map to `pairing-lost`.
  - **Never delete or corrupt the file.** An unreadable registry yields `registry_unavailable`, which the client treats as `retry` forever, never as a failure.
  - **Caveat for the `kill -9` → `restarting` scenario:** if the web client's device key is session-only (`ephemeral: true`), orcad drops its row at restart (`device-registry.ts:317-319`), so a plain restart already loses pairing. That row must first establish that Phase 64/65's client holds a persistent key, or that TAB-08 re-pairs automatically. **Depends on 64/65.**
- **A-8 (P67-10, the holder-5 registry files at the pin):**
  - `orca-devices.json` (`DEVICE_REGISTRY_FILENAME`);
  - its durable-write temporaries, `orca-devices.json.<pid>.<ms>.<hex>[.owner-<x>].tmp`;
  - its quarantine copies, `orca-devices.json.corrupt-<ms>`;
  - the companion `orca-e2ee-keypair.json` (`MOBILE_PAIRING_USERDATA_FILES`).

  The scanner derives the set from `mobile-pairing-files.ts`, plus the two sibling-name patterns from `durable-file-write.ts:117` and `device-registry-corruption.ts:5-7`. Only `orca-devices.json` and its siblings carry the token. The keypair file is excluded as pairing material and is not expected to hold a needle.
- **A-9 (P67-23, observer lifetime): keep the observer for the document's life, not 10 s.** `Landing` mounts whenever no workspace is active (`AppWorkspaceShell.tsx:106-108`), so it remounts after the user closes the last workspace. A 10 s observer would leave Orca's logo on every remount. The parent has already said yes for this document (the port gate), so the cost stays on orcad-origin documents only. The child re-applies to each newly matched element. Registration: `allFrames` left false (top level only) and `messageManagerGroups` left unset, so stock windows are covered as P67-22 needs.
- **A-10 (P67-24): confirmed.** `div.size-20.rounded-2xl > img.size-12` is the only static className pair holding both `size-20` and `rounded-2xl` in all of `orca/out/web/assets/*.js` at the pin.
- **A-11 (P67-09, `writePrivateFile`): close the window rather than lean on the folder mode.** IOUtils always opens with `0666 & ~umask` and has no mode option (`IOUtils.cpp:1526`). The minimal fix uses IOUtils only, so no new internal API:
  1. remove a stale `.tmp`;
  2. `IOUtils.write(tmp, new Uint8Array(0), { mode: "create" })` (O_EXCL, empty);
  3. `setPermissions(tmp, 0o600)`;
  4. `writeUTF8(tmp, text, { mode: "overwrite" })` (O_TRUNC on the same inode keeps 0600);
  5. `IOUtils.move(tmp, path)` (rename keeps the mode).

  Keep re-applying 0700 to the folder (P67-09). Code is under Code Examples.
- **A-12 (P67-02):** an unreadable or corrupt `orca-devices.json` never reaches the page: the client retries with backoff (`registry_unavailable` → `retry`). Record this as a known limit in the SUMMARY. No class is added.
- **A-13 (new fact for the containment row):** Theia's `/file-upload` writes wherever its `uri` field points. A probe or fixture must never point it outside a scratch folder. This research's probe wrote only into its own output folder.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Origin / Sec-Fetch rule | Theia backend (token-gate early middleware + WS validator) | Chrome cookie strip (defence in depth) | Only the server sees every request, including stock-window and worker ones |
| Failure classification | Chrome (`OrcaEnv.failureClassOf`, `OrcaService`) | Theia frontend (client-reason map) | orcad failures are known only in chrome; client auth failures only in the page |
| Failure page | Theia frontend (`OrcaPaneWidget`) | Chrome diagnostics layer | No identifier crosses to the frontend (P67-04) |
| Temp-root and override refusal | Chrome (`OrcaService` preflight, pure rule in `OrcaEnv`) | PowerBrowserAPI (`TmpD`, realpath) | Must run before spawn |
| Offer file write | Chrome boundary (`writePrivateFile`) | — | One writer, 0700/0600 |
| Offer file read | Theia backend (orca-panes) | — | lstat, uid and mode checks before reading (P67-09) |
| Logo injection | Content child (`GroupActorChild.sys.mjs`) | Chrome parent (port gate, data URI) | Child has no privileges; parent decides |

## Live header record (P67-14)

Run: `flock /home/chris/coding/Power-Browser/.git/pb-live.lock node .planning/workstreams/orca/phases/67-hosting-hardening/probes/record-sidecar-headers.mjs <out>`. It used this worktree's `objdir` (headless), with `ORCA_*` unset, `MOZ_PURGE_CACHES=1`, and `NODE_OPTIONS=--require probes/header-recorder.cjs` inherited by the sidecar. The recorder logs booleans for cookie presence and never a cookie value. A foreign page was served from a second `127.0.0.1` port by `servePages`. Output, verbatim (columns: kind | method | origin | sec-fetch-site | mode | dest | user | pbCookie | theiaCookie | status):

```
page-side results: {"theia":{"nocors":"sent","cors":200,"ws":"open","upload":"sent","worker":"sent"},"stock":{"nocors":"sent","cors":"blocked","ws":"error","upload":"sent","worker":"sent"},"overlay":{"nocors":"sent","cors":"blocked","ws":"error","upload":"sent","worker":"sent"}}
http | GET |  |  |  |  |  | true | false | 200  (5; /powerbrowser/health)
http | GET |  | none | navigate | document |  | true | false | 200  (1; /)
http | GET |  | same-origin | cors | empty |  | true | true | 200  (10; /socket.io/)
http | GET |  | same-origin | cors | script |  | true | true | 200  (1; /editor.worker.js)
http | GET |  | same-origin | no-cors | image |  | true | true | 404  (1; /favicon.ico)
http | GET |  | same-origin | no-cors | script |  | true | true | 200  (1; /bundle.js)
http | GET |  | same-origin | no-cors | style |  | true | true | 200  (1; /bundle.css)
http | POST | http://127.0.0.1:41673 | same-origin | cors | empty |  | true | true | 200  (7; /socket.io/)
probe=overlay-cors :: http | GET | http://127.0.0.1:42727 | same-site | cors | empty |  | false | true | 403
probe=overlay-img :: http | GET |  | same-site | no-cors | image |  | false | true | 403
probe=overlay-nocors :: http | GET |  | same-site | no-cors | empty |  | false | true | 403
probe=overlay-upload :: http | POST | http://127.0.0.1:42727 | same-site | no-cors | empty |  | false | true | 403
probe=overlay-worker :: http | GET |  | same-site | no-cors | empty |  | false | true | 403
probe=overlay-ws :: ws | GET | http://127.0.0.1:42727 | same-site | websocket | empty |  | false | true | 400
probe=stock-cors :: http | GET | http://127.0.0.1:42727 | same-site | cors | empty |  | true | true | 200
probe=stock-img :: http | GET |  | same-site | no-cors | image |  | true | true | 200
probe=stock-nocors :: http | GET |  | same-site | no-cors | empty |  | true | true | 200
probe=stock-samesite-nav :: http | GET |  | same-site | navigate | document |  | true | true | 200
probe=stock-upload :: http | POST | http://127.0.0.1:42727 | same-site | no-cors | empty |  | true | true | 200
probe=stock-worker :: http | GET |  | same-site | no-cors | empty |  | false | true | 403
probe=stock-ws :: ws | GET | http://127.0.0.1:42727 | same-site | websocket | empty |  | true | true | 400
probe=theia-cors :: http | GET |  | same-origin | cors | empty |  | true | true | 200
probe=theia-img :: http | GET |  | same-origin | no-cors | image |  | true | true | 200
probe=theia-nocors :: http | GET |  | same-origin | no-cors | empty |  | true | true | 200
probe=theia-upload :: http | POST | http://127.0.0.1:41673 | same-origin | no-cors | empty |  | true | true | 200
probe=theia-worker :: http | GET |  | same-origin | no-cors | empty |  | true | true | 200
probe=theia-ws :: ws | GET | http://127.0.0.1:41673 | same-origin | websocket | empty |  | true | true | 101
probe=xsite-nav :: http | GET |  | cross-site | navigate | document |  | true | false | 200
ws | GET | http://127.0.0.1:41673 | same-origin | websocket | empty |  | true | true | 101  (3; /socket.io/)
upload-theia.txt written by the sidecar: true
upload-stock.txt written by the sidecar: true
upload-overlay.txt written by the sidecar: false
```
(The 304 duplicates of `/bundle.js`, `/bundle.css` and `/editor.worker.js` are omitted: same header pair.)

What the record shows [VERIFIED: live run]:
- **Gecko sends `Sec-Fetch-*` to `http://127.0.0.1`.** This closes the P67-14 assumption for content requests.
- **The system-principal health probe sends neither `Origin` nor any `Sec-Fetch-*`.** The shell's swap into Theia is `none` / `navigate`.
- **The Theia document sends no `Origin` on same-origin GETs and its own origin on POSTs and WebSockets,** always with `Sec-Fetch-Site: same-origin`. Its worker does the same.
- **Overlays are already covered by the strip:** `pbCookie: false` gives a 403. Stock-window workers too (no browsing context, wrong principal host gives a strip).
- **Stock-window pages keep the token, and the gate passes them.** Theia's connection cookie arrives too.
- **Cross-port WebSockets are already refused by Theia** (400, `WsOriginValidator`: Origin host must equal the Host header).
- **The P67-13 or A-1 rule refuses every stock row:** same-site, or a foreign Origin. It admits every PB row.

## Standard Stack

No new packages. Everything is in-tree or already installed:

| Piece | Version | Use |
|---|---|---|
| `@theia/core` (WsOriginValidator, BrowserConnectionToken, socket.io allowRequest) | 1.76.0 [VERIFIED: theia/node_modules/@theia/core/package.json] | Unchanged; the rule sits in PB's token gate |
| Gecko IOUtils / nsIFile / JSWindowActor | ESR pin in `upstream/` | `writePrivateFile`, temp dirs, logo actor |
| Orca | v1.4.248 [VERIFIED: `orca` HEAD tag `v1.4.248`] | Read-only source of truth for every derived constant |
| Node | 24.x (host v24.22.1) | Checks, `node:sqlite` for the history collector |

## Package Legitimacy Audit

No external package is installed by this phase. **Removed [SLOP]:** none. **Flagged [SUS]:** none.

## Architecture Patterns

### System Architecture Diagram

```
 request to 127.0.0.1:<sidecar>
   |
   v
 Gecko adds cookies --> chrome strip (http-on-modify-request): overlay / foreign worker -> token removed
   |
   v
 sidecar HTTP server
   |-- /socket.io/* ----> socket.io allowRequest -> WsRequestValidator
   |                         [PB allowWsUpgrade: origin-policy -> token]  [Theia WsOriginValidator] [Theia conn token]
   |-- everything else -> earlyMiddleware[0] = PB gate():
                             isWebviewHost? -> webview shell files only (unchanged)
                             origin-policy(Origin, Sec-Fetch-Site, port) -> 403 on foreign   (NEW)
                             token cookie == token? -> next() else 403
                                -> Theia connection-token bootstrap -> routes (/file-upload, /file, static, /powerbrowser/health)
```

### Pattern: pure origin policy beside `webview-host.ts`
`theia/extensions/token-gate/src/common/origin-policy.ts` exports one pure function. The gate imports it, and so does the quick check (through the transpile rule P63-27 already uses for TS). Call sites:
- `gate()`: after `isWebviewHost` and before the token comparison;
- `allowWsUpgrade()`: after the `disabled` early return and before the token. It runs for socket.io polling handshakes as well, because Theia passes `allowRequest` through the same validator (`websocket-endpoint.js:39-42`).

### Pattern: temp-root preflight
- `PowerBrowserAPI` gains two boundary methods, each with an `INTERNAL-APIS.md` row like the `getProfileDir` row:
  - `getTempDir()`, returning `Services.dirsvc.get("TmpD", Ci.nsIFile).path` (the pattern of `:441` and `:450`);
  - `realPath(path)`, through `nsIFile.normalize()`, which calls `realpath(3)` on Unix (`nsLocalFileUnix.cpp:636`).
- `OrcaEnv.tempRootOf({ dataRoot, effectiveRoot, roots })` is pure. It returns the matched root or null.
- `OrcaService.start()` calls it after `_resolve()` and before `_reapLeftover`/`_launch`.

### Anti-Patterns to Avoid
- **A deny-list on `Sec-Fetch-Site`.** A new value would pass.
- **Building the allowed origin from a list or from `Host`.** Use `this.port` from `announce()`.
- **Inducing pairing loss by deleting or corrupting `orca-devices.json`.** That produces an infinite retry, not a failure.
- **Matching the logo by `src` or `alt`.** `src` is a build-specific data URL and `alt` is translated.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---|---|---|---|
| Cross-port WebSocket refusal | A second WS origin check in a new place | Theia's `WsOriginValidator` (already active) plus the one policy function in `allowWsUpgrade` | Already measured refusing (400) |
| realpath in chrome | String manipulation of `..` and links | `nsIFile.normalize()` | Resolves symlinks (`/tmp` → `/private/tmp` on macOS) |
| Temp dir discovery | A hard-coded `/tmp` | Gecko `TmpD` plus the env names, as A-4 lists | Gecko and Node consult `TMPDIR`/`TMP`/`TEMP` |
| Report strings | Literal copies of Orca prose | Evaluate the pinned `describe*` functions (P67-20) | The prose changes on re-pin |
| Device revoke | An RPC call | An on-disk registry edit (A-7) | No headless revoke exists at the pin |

## Runtime State Inventory

Not a rename phase. One runtime-state effect is recorded: live rows that start orcad write the developer's real `~/.orca` (the key folder is `join(homedir(), '.orca')`, `orcad-plaintext-credential-migration.ts:42-44`; `HOME` is in `ORCAD_ENV_ALLOWLIST`). A `~/.orca/orcad-secret-store-<hex>.json` exists on this host now. See Open Question 2.

## Common Pitfalls

### Pitfall 1: Rejecting the health probe or the swap
**What goes wrong:** Theia never loads, or the supervisor reports it unhealthy.
**Why:** both requests come from chrome. The probe carries no `Origin` and no `Sec-Fetch-*`; the swap carries `Sec-Fetch-Site: none`.
**How to avoid:** admit an absent value and `none` (A-1).
**Warning sign:** the existing Theia-boot live rows go red after p67-02.

### Pitfall 2: The rule only in `gate()`
socket.io answers `/socket.io/` before express, so `gate()` never sees it (comment at `token-gate-backend-contribution.ts:188-190`). Put the rule in `allowWsUpgrade()` as well.

### Pitfall 3: Probing `/file-upload` with a real path
The endpoint moves the upload onto `uri` with `overwrite: true` (`node-file-upload-service.js:59-66`). Checks use `/powerbrowser/health` for refusal outcomes. If an upload outcome is needed, target a path inside the check's own scratch folder.

### Pitfall 4: Pairing-loss induction that never fires
Edits must keep the file valid JSON. orcad adopts on-disk removals at the next auth check, so the client has to reconnect (an orcad restart) before the page can appear (A-7).

### Pitfall 5: A `kill -9` row that shows `pairing-lost` instead of the pane
A session-only client key is dropped at orcad restart. Prove the key is persistent first, or accept the TAB-08 re-pair (A-7). **Depends on 64/65.**

### Pitfall 6: Windows temp paths
`GetTempPathW` can return an 8.3 short path, so a prefix comparison with a long profile path misses. Phase 68 owns the Windows run; the pure rule should compare case-insensitively on Windows. [ASSUMED]

### Pitfall 7: The alias left behind by every live run
After A-6, each run creates `$XDG_RUNTIME_DIR/pb-orca-<hex>`. Remove it in `dispose()`.

### Pitfall 8: Absence assertions without a positive control
CLAUDE.md verification rule 1 applies to `sidecar-origin-gate-live`: send the PB-origin request first and require 200 before judging a 403 as the rule.

## Code Examples

### Origin policy (TypeScript, pure)
```ts
// theia/extensions/token-gate/src/common/origin-policy.ts
export type OriginVerdict = 'allow' | 'foreign-origin' | 'foreign-fetch-site';
const SAME_ORIGIN_SITES = new Set(['same-origin', 'none']);
export function originVerdict(origin: string | undefined, fetchSite: string | undefined, port: number | undefined): OriginVerdict {
    if (port === undefined) {
        return 'foreign-origin';
    }
    if (origin !== undefined && origin !== `http://127.0.0.1:${port}`) {
        return 'foreign-origin';
    }
    if (fetchSite !== undefined && !SAME_ORIGIN_SITES.has(fetchSite)) {
        return 'foreign-fetch-site';
    }
    return 'allow';
}
```
In `gate()` and `allowWsUpgrade()`, call it with `req.headers.origin` and `req.headers['sec-fetch-site']`. A string array cannot occur for either header in Node. Any non-`allow` verdict: `res.sendStatus(403)` with no header set, or `return false`. Header values from the record: `Origin` `http://127.0.0.1:41673` (own) and `http://127.0.0.1:42727` (foreign); `Sec-Fetch-Site` values `none`, `same-origin`, `same-site` and `cross-site`.

### `writePrivateFile` without the umask window (chrome)
```js
// Replaces the body after the name check, ServerDestroyer/p63-05 PowerBrowserAPI.sys.mjs:11022-11026.
await IOUtils.makeDirectory(dir, { createAncestors: true, ignoreExisting: true, permissions: 0o700 });
const posix = lazy.AppConstants.platform !== "win";
if (posix) await IOUtils.setPermissions(dir, 0o700, false); // P67-09: an existing folder too
const path = PathUtils.join(dir, name);
const tmp = `${path}.tmp`;
await IOUtils.remove(tmp, { ignoreAbsent: true });           // O_CREAT keeps a stale file's old mode
await IOUtils.write(tmp, new Uint8Array(0), { mode: "create" }); // O_EXCL: a fresh, empty inode of ours
if (posix) await IOUtils.setPermissions(tmp, 0o600, false);  // 0600 before any byte is written
await IOUtils.writeUTF8(tmp, String(text), { mode: "overwrite" }); // O_TRUNC, same inode, mode kept
await IOUtils.move(tmp, path);                                // rename keeps 0600
```
Flags are verbatim from `upstream/xpcom/ioutils/IOUtils.cpp:1479-1493`: `case WriteMode::Overwrite: flags |= PR_TRUNCATE | PR_CREATE_FILE;` and `case WriteMode::Create: flags |= PR_CREATE_FILE | PR_EXCL;`. The open mode is at `:1526`: `stream->Init(writeFile, flags, 0666, 0)`. `verify-orca-bridge-dir.mjs` gains a scenario that runs with umask 022 and stats the file between the write and the move (or asserts 0600 on the `.tmp`).

## State of the Art

| Old | Current | When | Impact |
|---|---|---|---|
| Cookie strip only (BAR-02, v1.5) | Server-side Origin and `Sec-Fetch-Site` rule | This phase | Stock windows and any future strip regression covered |
| Theia connection token, assumed to block cross-origin | Same-site pages send it too (Strict ≠ same-origin) | Measured this session | Theia's HTTP guard does not cover cross-port pages |

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|---|---|---|
| A1 | A Windows 8.3 short temp path needs normalization before a prefix comparison | Pitfall 6 | Windows refusal misses a temp profile (Phase 68 run) |
| A2 | engine.io calls `allowRequest` once per session handshake, and later polling requests carry only the `sid` | Pitfall 2 | Low: the `sid` is unguessable, and WS upgrades are validated per request |
| A3 | Phase 64/65's web client holds a persistent (IndexedDB) device key in Gecko | A-7, Pitfall 5 | The `kill -9` row shows `pairing-lost` instead of the pane |
| A4 | A removed `orca-devices.json` (as opposed to an edited one) is not adopted as "all revoked" | A-7 | None for the plan: the edit route is the prescribed one |

## Open Questions

1. **Ship the RUN-08 fix to `main` before v1.7?**
   - What we know: the hole is on `main`, Orca-independent, and an arbitrary file write from any `127.0.0.1` page in a stock window.
   - Recommendation: the coordinator raises a ledger or carry-forward row and asks Chris in the box. The p67-02 lane is self-contained (one TS file, two call sites, two checks) and can be cherry-picked.
2. **Should live rows that start orcad set `HOME` to a scratch folder,** so the developer's `~/.orca` is untouched?
   - What we know: `HOME` passes to orcad, and the key folder is `~/.orca`.
   - Recommendation: yes, for `orca-credential-store-live` at least, because step 2 asserts on a key record. This is the planner's call: a changed `HOME` also changes Gecko's non-profile paths.
3. **The pane bundle header class** (A-2): confirm after the Phase 64 merge with the kept probe.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|---|---|---|---|---|
| Built PB (`objdir/dist/bin/powerbrowser`) in this worktree | live rows | ✓ | built 2026-11-08 | `PB_FIREFOX_BIN` → main checkout |
| Built Orca (`orca/out/orcad/orcad.js`, `out/web/assets/Landing-znBnkpKr.js`) | selector, credential and logo rows | ✓ | v1.4.248 | quick rows SKIP |
| Theia `node_modules` (1.76.0) | origin-gate rows | ✓ | 1.76.0 | — |
| `flock`, Node | live lock, checks | ✓ | Node v24.22.1 | — |
| `$XDG_RUNTIME_DIR` | alias for long data roots | ✓ | `/run/user/1000` | `~/.cache` (OrcaEnv) |

## Validation Architecture

(`workflow.nyquist_validation` is `true`.) Plain Node scripts under `scripts/verify-platform.sh`. No human check is created (D-18): the four deferred items in 67-CONTEXT stay in the end-of-milestone pass.

### Test Framework
| Property | Value |
|---|---|
| Framework | Node 24 scripts, `scripts/verify-platform.sh` rows |
| Config file | none (registry rows) |
| Quick run command | `scripts/verify-platform.sh --quick` (or `--only <label>`) |
| Full suite command | `scripts/verify-platform.sh` (live rows under `flock /home/chris/coding/Power-Browser/.git/pb-live.lock`, `MOZ_PURGE_CACHES=1`) |

### Phase Requirements → Test Map
| Criterion / Req | Behavior | Row(s) | Tier | Self-test plants | Needs |
|---|---|---|---|---|---|
| SC3 / RUN-08 | Pure policy over the derived case table: own origin, orcad's origin, another loopback port, `null`, `http://127.0.0.1.evil.com:<p>`, each `Sec-Fetch-Site` value (`none`, `same-origin`, `same-site`, `cross-site`, an unknown value), no headers, undefined port | `sidecar-origin-gate`, `-self-test` | quick | invert each expected outcome in turn; red naming the case | `theia/` |
| SC3 / RUN-08 | Standalone sidecar with a known test token. Positive control first: PB `Origin` gives 200 and the WS is accepted. Then orcad's `Origin` gives 403 and a refused WS; `Sec-Fetch-Site: same-site` without `Origin` gives 403; `none` gives 200; no headers gives 200 | `sidecar-origin-gate-live` | full | — | built Theia |
| SC3 (PB still served) | Every existing live row that loads the Theia document; `record-sidecar-headers.mjs` re-run shows a pane-bundle class only in `same-origin` | existing rows, coordinator | full | — | built PB |
| SC1 / RUN-06 | Class map is total over the derived codes, steps and reasons | `orca-failure-classes`, `-self-test` | quick | added reason, removed class, class without copy, unmapped step | `orca/` |
| SC1 / RUN-06 | Copy passes the shape test, button names match the affordance table | `shell-error-copy-no-internals` (extended) | quick | leaked code, ad-hoc literal, sentence naming an unrendered button | tree |
| SC1 / RUN-06 | Three inductions: `kill -9`; pre-bound port; registry edit plus restart (A-7) | `orca-failure-page-live` | full | — | built PB + Orca, merged 64/65 |
| SC2 / RUN-07 | Fixtures per sink; holder-5 set derived from the pin (A-8) | `orca-pairing-containment-self-test` | quick | the P67-12 plants plus "a needle in `orca-devices.json.corrupt-1` is allowed, a needle in `orca-data.json` is red" | fixtures |
| SC2 / RUN-07 | Live scan with controls | `orca-pairing-containment-live` | full | — | built PB + Orca |
| SC4 / RUN-09 | Override name and value, Orca's temp roots ⊆ PB's roots (A-4 set), allowlist excludes the name, statement present while only `host-file` is written | `orca-credential-store`, `-self-test` | quick | the P67-29 plants plus "PB root set lacks `$TMP`" | `orca/` |
| SC4 / RUN-09 | Four steps; report compared with the two-variant set (A-5) | `orca-credential-store-live` | full | — | built PB + Orca |
| SC5 / INJ-01 | Selector entry for the pinned version; tokens in `Landing-*.js` | `orca-landing-selectors`, `-self-test` | quick (SKIP without build) | missing version, absent token | `orca/out` |
| SC5 / INJ-01 | Proxy control shows Orca's logo; orcad port shows the PB mark; the Theia DOM is untouched; a remount after closing a workspace still shows the PB mark (A-9) | `orca-landing-logo-live` | full | — | built PB + Orca |
| P67-09 | Bridge folder 0700 re-applied; the `.tmp` is 0600 before content (A-11) | `verify-orca-bridge-dir.mjs` (extended) | quick | file left at umask mode | tree |

### Sampling Rate
- **Per task commit:** `scripts/verify-platform.sh --only <the lane's rows>`, then `node scripts/scan-brand-residue.mjs` after staging.
- **Per wave merge:** `scripts/verify-platform.sh --quick`.
- **Phase gate:** `--quick` green, then after `./mach build faster` and a Theia rebuild: every Theia-loading live row, then the new live rows under the lock; then `/gsd-verify-work`.

### Wave 0 Gaps
- [ ] `theia/extensions/token-gate/src/common/origin-policy.ts` before both gate checks.
- [ ] `OrcaEnv` constants (failure classes, temp-root rule, override name, selector table) before any check imports them.
- [ ] `scripts/lib/mozlz4.mjs` and the fixture tree before the containment self-test.
- [ ] A-6 profile base in `pb-relaunch.mjs` and `firefox-bidi.mjs`, with alias removal in `dispose()`, before any Phase 67 live row runs.

## Security Domain

### Applicable ASVS Categories
| ASVS Category | Applies | Standard Control |
|---|---|---|
| V2 Authentication | yes | Token cookie (unchanged) plus the Origin and `Sec-Fetch-Site` rule (new) |
| V3 Session Management | yes | Host-only, HttpOnly, SameSite=Lax session cookie; same-site is not same-origin on loopback |
| V4 Access Control | yes | Sidecar refuses foreign origins; the actor parent answers only orcad-port senders |
| V5 Input Validation | yes | Offer file lstat, mode, uid and endpoint checks (P67-09); closed client-reason set (P67-04) |
| V6 Cryptography | no new | Orca's key file; PB states its limit (P67-18) |
| V8 Data Protection | yes | Offer containment (RUN-07); refusal of plaintext and temp roots (RUN-09) |

### Known Threat Patterns
| Pattern | STRIDE | Mitigation |
|---|---|---|
| Same-site CSRF from another loopback port (dev server, orcad page) to `/file-upload`: **arbitrary file write, measured** | Tampering / Elevation | A-1 rule in `gate()`; strip kept |
| Cross-port WebSocket hijack of Theia RPC | Elevation | Already refused by Theia `WsOriginValidator` (measured 400); A-1 rule in `allowWsUpgrade()` too |
| Offer read by another user during the write | Information disclosure | A-11 sequence plus the 0700 folder |
| Offer symlink swap in the bridge folder | Tampering | lstat, regular file, own uid, no group or other bits (P67-09) |
| Plaintext credentials from a temp profile | Information disclosure | Refusal (P67-16, P67-17) |

## Sources

### Primary (HIGH confidence; read or run this session)
- **Live run:** `probes/record-sidecar-headers.mjs` + `probes/header-recorder.cjs` (output above).
- **Token gate and Theia:**
  - `theia/extensions/token-gate/src/node/token-gate-backend-contribution.ts:149-166`, `:187-198`. `gate()` passes when `token !== undefined && this.isTokenValid(token)`, otherwise `res.sendStatus(403)`.
  - `@theia/core` 1.76.0:
    - `lib/node/hosting/ws-origin-validator.js:23-46` ("Browsers omit the Origin header for same-origin requests"; `return originHost === hostHeader;`);
    - `lib/node/hosting/browser-connection-token.js` (`sameSite: 'strict'`, `BROWSER_TOKEN_COOKIE_NAME = 'theia-connection-token'`);
    - `lib/node/messaging/websocket-endpoint.js:39-42`.
  - `@theia/filesystem` 1.76.0: `lib/node/upload/node-file-upload-service.js:41-43`, `:59-66` (`await fs.move(request.file.path, target, { overwrite: true });`); `lib/common/file-upload.js:19` (`HTTP_FILE_UPLOAD_PATH = '/file-upload'`).
- **Chrome:**
  - `powerbrowser/shell/PowerBrowserAPI.sys.mjs:540-578` (`Ci.nsICookie.SAMESITE_LAX`), `:5577-5587`, `:6283-6310`, `:2262-2292`, `:9982-9989`;
  - `ServerDestroyer/p63-05:powerbrowser/shell/PowerBrowserAPI.sys.mjs:11018-11027` (`await IOUtils.writeUTF8(path, String(text), { tmpPath: \`${path}.tmp\` });`);
  - `powerbrowser/shell/OrcaEnv.sys.mjs:33-59` (allowlist includes `"TMPDIR"` and `"HOME"`), `:178-197`;
  - `scripts/lib/pb-relaunch.mjs:249-251`; `scripts/lib/firefox-bidi.mjs:277`, `:372`.
- **Gecko:** `upstream/xpcom/io/SpecialSystemDirectory.cpp:458-488` (`PR_GetEnv("TMPDIR")` → `"TMP"` → `"TEMP"` → `"/tmp/"`; Darwin `DarwinFileUtils::GetTemporaryDirectory`; Windows `::GetTempPathW`); `upstream/xpcom/io/nsLocalFileUnix.cpp:636` (`realpath`); `upstream/xpcom/ioutils/IOUtils.cpp:1479-1493`, `:1526`.
- **Orca v1.4.248 (pinned):**
  - Credential store:
    - `src/main/host/secret-protection-report.ts:17-19` (`return join(dirname(dataFile), 'orca-secret-protection.json')`), `:58-60`;
    - `src/main/orcad/orcad-secret-store-startup.ts:13` (`reportSecretProtectionGap({ dataFile: join(userDataPath, 'orca-data.json') })`);
    - `src/main/orcad/orcad-secret-protection-gap.ts:1-25` (`ORCAD_PLAINTEXT_SECRETS_ENV = 'ORCA_HEADLESS_SECRET_STORE'`; the three `describe*` strings);
    - `src/main/orcad/orcad-secret-key-resolution.ts:150`, `:159-168`;
    - `src/main/orcad/orcad-secret-key-record.ts:101-114` (`const roots = [tmpdir(), '/tmp', '/var/tmp']`, realpath of both);
    - `src/main/orcad/orcad-secret-store.ts:34-44` (gap per state, including `pending`);
    - `src/main/orcad/orcad-plaintext-credential-migration.ts:42-44` (`return join(homedir(), '.orca')`).
  - Device registry:
    - `src/main/runtime/mobile-pairing-files.ts` (`DEVICE_REGISTRY_FILENAME = 'orca-devices.json'`, `MOBILE_PAIRING_USERDATA_FILES`);
    - `src/shared/runtime-e2ee-keypair-file.ts:5` (`E2EE_KEYPAIR_FILENAME = 'orca-e2ee-keypair.json'`);
    - `src/main/runtime/device-registry.ts:204-207`, `:303-319`;
    - `src/main/filesystem/durable-file-write.ts:117`; `src/main/runtime/device-registry-corruption.ts:5-7`;
    - `src/main/runtime/runtime-rpc/runtime-rpc-mobile-devices.ts:16-28`; `src/main/ipc/mobile.ts:229-237`; `src/renderer/src/web/preload-api/web-mobile-api.ts:16`.
  - Web client:
    - `src/renderer/src/web/web-runtime-auth-verdict.ts:23-42`;
    - `src/renderer/src/web/web-runtime-credential-source.ts:119-143` (persistent vs `ephemeral: true` plans);
    - `src/renderer/src/web/web-pairing.ts:11-19`.
  - Landing page:
    - `src/renderer/src/components/Landing.tsx:259-267` (`className="flex items-center justify-center size-20 rounded-2xl border border-border/80 shadow-lg shadow-black/40"`, `className="size-12"`);
    - `out/web/assets/Landing-znBnkpKr.js`; `out/web/web-index.html` (no CSP meta);
    - `src/main/runtime/rpc/static-web-client-handler.ts:91-100` (sets only Content-Type, Content-Length and Cache-Control).
- **Node:** `os.tmpdir()` order `TMPDIR`, `TMP`, `TEMP`, then `/tmp`, run on this host.

## Metadata

**Confidence breakdown:**
- Origin rule and gap: HIGH. Measured live; the code is identical on `main` (`git diff main -- theia/extensions/token-gate` is empty, and the strip function is identical).
- Credential store and registry: HIGH. Read at the pin.
- Pairing-loss and `kill -9` behaviour of the hosted client: MEDIUM. Depends on 64/65.
- Logo: HIGH for the selector and CSP; MEDIUM for remount timing in a live page.

**Research date:** 2026-11-10
**Valid until:** the next Orca re-pin or Theia re-pin (the selector, the report strings and the validator behaviour are pin-bound).
