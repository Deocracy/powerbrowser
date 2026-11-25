# Phase 66: PowerBrowser web tabs as Orca's browser - Research

**Researched:** 2026-11-10
**Domain:** A PB-owned Orca runtime client (S2 browser client host) in the Theia frontend, a chrome-side agent bridge over Gecko overlay `<browser>` elements, a content actor for input/page work, and the Orca 1.4.248 client-host protocol
**Confidence:** HIGH for the gate answers (each one ran on this host under the live lock: `results-p66-gate-dpr1.json`, `results-p66-gate-dpr2.json`). MEDIUM for the parts that need Phase 64's pane bundle, which is not merged here (renderer-placement device match, `createBrowserTab` through the hosted UI). Three picks are amended by measurement: P66-07/P66-14 (a background agent tab cannot take input while hidden), P66-10 (the renderer path fails by default) and P66-16 (the snapshot reference format is a different source).

<user_constraints>
## User Constraints (from 66-CONTEXT.md)

Every pick is Claude's auto-mode pick; Chris may override any of them before the dependent work lands or in the end-of-milestone pass (59-CONTEXT D-18). The headline of each pick is quoted below; the full text, reasons and reversibility notes are in `66-CONTEXT.md` `<decisions>` and are binding as written there, except where "Context amendments" below changes them.

### Locked Decisions

**Runtime client and pairing (condition 1, BRW-03)**
- **P66-01:** the S2 runtime client runs in the Theia frontend, in a new extension `@powerbrowser/orca-browser` (`theia/extensions/orca-browser`); it is not in the Theia backend and not chrome-side.
- **P66-02:** the client is PB-owned and thin, built over Orca's shared modules, not over `WebRuntimeClient`; it is compiled by Orca's toolchain from PB-added overlay files and served by the Theia backend, never from orcad's port.
- **P66-03:** the client pairs with the offer P64-07 already hands to the frontend and attaches at frontend start whenever orcad is ready, in every mode.
- **P66-04:** `/gsd-plan-phase 66` research runs bounded probes before any plan is written, and their results fix the dependent picks.

**Tab ownership (condition 5, BRW-03, criterion 2)**
- **P66-05:** the client holds one page table, `browserPageId` to web-tab id, and enforces one-to-one in both directions.
- **P66-06:** the chrome-side wall is the second, independent layer: a tab is an agent tab only if it was created with an `agent` flag, and every agent kind refuses any other tab.
- **P66-07:** an Orca-created tab opens in the background and never takes focus.
- **P66-08:** a user's close of an Orca tab is Orca's page close, and a frontend reload ends the client's pages.

**Browser panes and entry points (BRW-02, criterion 1, Route B' per spike 004)**
- **P66-09:** browser panes take Route B' with the real page in place of a pane page: the client is the only creator of Orca web tabs, and P64's `browser` route reveals the mapped tab.
- **P66-10:** criterion 1's check derives Orca's browser-pane entry points from the pinned source and proves each routes to a PB web tab.

**Ability set and how each row is built (conditions 2, 3, 4)**
- **P66-11:** Q4 is decided as "relabel": no BiDi or BiDi+ row reaches a WebDriver BiDi module, in process or over a port; each becomes `native` (chrome-side code in `PowerBrowserAPI.sys.mjs`) or `actor` (a PB content actor). (Row table: native 7, native plus child 2, actor 23, per Q5 2.)
- **P66-12:** one new web-tab message kind, `webTabAgent`, carries `{ tabId, method, params }`, where `method` is the Orca automation method name itself (`browser.click`, ...), plus one kind `webTabAgentStop`; there is no second vocabulary.
- **P66-13:** the actor rows run in one new actor pair, `PowerBrowserAgent`, whose child class is appended to `powerbrowser/shell/GroupActorChild.sys.mjs` and which is registered from inside `registerGroupActor`, the precedent of the edit-state pair.
- **P66-14:** Q3 is handled by a research probe that gates the 13 pointer and key rows: input is synthesised in the page's own window by the agent child, which must reach a hidden overlay without moving focus, and coordinates are CSS pixels of the page's viewport at every device pixel ratio.
- **P66-15:** Q5 is handled by a research probe; `dialogAccept` and `dialogDismiss` are built `native` if chrome holds the overlay's `alert`/`confirm`/`prompt`/`beforeunload` prompt through PB's existing page-prompt handling, else `actor`.
- **P66-16:** `snapshot` is its own plan in wave 2, built in the agent child: an accessibility-style tree computed from the DOM (implicit roles plus ARIA, accessible names), a per-page ref table of weak references bound to live nodes, and a per-page delta baseline, emitting the text format Orca's agents read.
- **P66-17:** `exec` serves the documented subset (`read`, `get`, `is`) through the agent child and answers every other verb `browser_command_unavailable`.
- **P66-18:** every tier-2 and tier-3 automation method is answered `failed` with `browser_command_unavailable`, as the proof did for every unserved command (`s2-host.ts` `serve`).
- **P66-19:** the built mechanism of each ability lives in one tracked table in the Theia extension, and the spike's `DISPOSITIONS.md` is not edited.

**Agent mark and Stop (BRW-04, criterion 3)**
- **P66-20:** chrome owns the "agent is controlling" state and pushes it; the frontend only draws it.
- **P66-21:** the mark is a chrome-bar element beside the sharing indicator, with a Stop button, plus a title mark on the tab itself.
- **P66-22:** Stop ends agent control of that tab for the tab's lifetime.
- **P66-23:** the new copy is the mark's label and tooltip and the Stop button's label and tooltip, added to `chrome-bar-copy.ts` beside the sharing rows (`:72-75`), with no internal identifier.

**Tools in PB chrome (BRW-05, criterion 4)**
- **P66-24:** each of the 30 user-facing rows in spike 005's table (U-01..U-30) resolves to an existing PB contribution, the new mark, a documented skip, or a deferral to a named v2 requirement; Phase 66 builds only the mark.
- **P66-25:** criterion 4's check parses the U-rows from the spike README table and compares them as a set with a PB map, then proves each mapped contribution exists in the tree.

**Privacy and egress**
- **P66-26:** Orca-created tabs load in their own container (a `userContextId` reserved for Orca agents), so agents do not share the user's cookies, storage or logins.
- **P66-27:** no endpoint-allowlist row and no new host; one plain-language paragraph on `website-staging/privacy.html`.

**No WebDriver BiDi port (criterion 2)**
- **P66-28:** `no-remote-agent-port-live` lists the listening TCP sockets of the shipped build's process tree and requires each to be accounted for by a value derived at run time: the Theia sidecar's port and orcad's port.

**Phase 62's deferred clause**
- **P66-29:** the end-to-end agent row also proves "PB's orcad completes a browser request without launching the decoy".

**Checks**
- **P66-30:** every check is one row plus a `-self-test` row in `scripts/verify-platform.sh`, expectations derived from the pinned Orca source or the tree and compared as sets. (Rows: `orca-browser-abilities`, `orca-browser-host-bundle`, `orca-browser-entry-points`, `orca-browser-tab-scope`, `orca-browser-tools`, `no-remote-agent-port-live`, `orca-browser-agent-live`, `orca-agent-mark-live`, `orca-browser-snapshot-live`; extended: `gui02-web-tab-bridge`, `internals-catalogue`, `orca-overlay`, `orca-overlay-built`, `orca-browser-parity`, `privacy-hosts`.)

**Seams**
- **P66-31:** zero new seam patches.

**Mechanics and lane cut**
- **P66-32:** three wave-1 lanes with disjoint files, one wave-2 lane for `snapshot`, then a coordinator plan; the research gate (P66-04) runs first, inside plan-phase. (p66-01 Orca-side client bundle; p66-02 Theia side; p66-03 chrome side; p66-04 wave 2 `snapshot`; p66-05 coordinator.)
- **P66-33:** user-facing copy is limited to P66-23's rows and the privacy paragraph (P66-27).

### Claude's Discretion
- Internal structure of `@powerbrowser/orca-browser`, the client bundle's module layout inside `orca-overlay/files/`, the exact Orca error codes for refusal and Stop (from Orca's existing set), the title-mark styling, the container's display name, and test fixture layout.

### Deferred Ideas (OUT OF SCOPE)
- Grab and annotate into an agent prompt (BRW-06), markup on screenshots (BRW-07), dev-server tiles (BRW-08), agents sharing the user's profile with consent (BRW-09).
- Tier-2 and tier-3 abilities, including the file channel for uploads and downloads, interception, emulation, storage, `find`, `highlight` and profiles.
- Popups opened by an agent tab are adopted as ordinary web tabs (Phase 36) and are not reported to orcad as pages; reporting them (U-14 "so agents can list it") waits for a tier-2 plan.
- The two upstream exports that would let Orca's own `WebRuntimeClient` act as a client host (capability parameter, same-connection subscribe), offered under D-27 only if P66-02's thin client needs them.
- Owner decisions open: spike 005 owner note (S2 replaces P61-05), P66-11, P66-22, P66-24, P66-26, P66-08 (table in `66-CONTEXT.md`).
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| BRW-02 | Each Orca browser page is a PowerBrowser web tab with PowerBrowser chrome; the stock screencast pane and its dead entry points are never shown. | Gate answer G6 (CLI `tab create` and client-placement `browser.tabCreate` both arrive as `createPage` and open one background PB web tab; the web build's default renderer path fails with `browser_unavailable`); amendment A3 (renderer path needs a PB placement override and one paired device). |
| BRW-03 | Orca agents drive PowerBrowser web tabs through a chrome-side bridge that can reach only Orca-created tabs; no WebDriver BiDi TCP port in shipped PowerBrowser. | G1 (thin client attaches with no private member), G2 (input reaches a parked agent overlay with no focus move), G3 (dialogs resolved chrome-side), G4 (one row per mechanism ran), G7 (user close reported), G8 (console), G10 (boundary allowance); amendment A1 (parked overlay); P66-28 unchanged. |
| BRW-04 | While an agent drives a tab, PowerBrowser's Theia chrome bar shows an "agent is controlling this tab" mark with a Stop button; stock browser windows are unchanged. | Stop error code pick (G11); P66-20 activity window matches Orca's `ACTIVITY_IDLE_MS = 20_000` (`orca/src/main/browser/browser-agent-activity.ts:15`). No probe needed; built in the p66-02/p66-03 lanes. |
| BRW-05 | The user-facing tools Orca's browser offers, as the spike inventories them, are added to PowerBrowser's chrome bar or Theia side panels. | P66-24/P66-25 unchanged; U-15 (page prompts) now has a measured mechanism and a user cost (G3, owner item O2). |
</phase_requirements>

## Summary

All eight items of the P66-04 gate ran live on this host, against the pinned Orca 1.4.248 build, the worktree's `objdir` PowerBrowser binary and the spike 005 harness, under `flock /home/chris/coding/Power-Browser/.git/pb-live.lock`, at device pixel ratio 1 and 2. No product file was edited: the agent child was stood in for by a throwaway `JSWindowActor` (`.planning/spikes/005-orca-browser-parity/p66-probe-child.sys.mjs`) registered at run time, and the S2 host by a thin PB client (`p66-thin-host.ts`) built with Orca's Vite into an ignored output path, with the tracked Orca state unchanged by the build.

The route holds: a thin client with no `WebRuntimeClient` and no write to an Orca constant attaches, serves `createPage`, `goto`, `closePage`, reports a user close, and coexists with a second client from the same offer. Chrome can resolve page dialogs by tab id, the content child can synthesise trusted pointer and key input and capture console calls, and `drawSnapshot` captures a hidden overlay with pixels aligned to CSS coordinates times the device pixel ratio.

**Findings the planner must act on (ordered by consequence):**

1. **A hidden agent overlay cannot take agent input, and a never-shown one has a 0×0 viewport.** P66-07's background tab, as PB opens it today, has `style.width/height` `0px` and a content viewport of `[0, 0]`; synthesised clicks land on `#document`, `focus()` does not move, and key events go to `BODY`. A tab shown once and then hidden keeps its old viewport (clicks hit), but `focus()` is still refused under a `visibility: hidden` embedder. The placement that works is **parked**: `visibility: visible`, `z-index: -1` (under the Theia frame), the main-area box, `docShellIsActive` left `false`. Parked, every input row worked, the user's tab kept chrome focus, document focus and its active element, recorded no blur, and chrome's `elementFromPoint` at the agent's target still returned the user's tab. This changes P66-07 and P66-14 and forces one visibility predicate in chrome (seven reads of `style.visibility === "visible"` mean "shown to the user").
2. **The web build's renderer path creates no page by default.** Orca's web preload returns `{ kind: 'server' }` for client-host placement (`web-runtime-environments-api.ts:216`), so a page created from Orca's UI in a paired web session (`createWebRuntimeSessionBrowserTab`, `web-runtime-browser-creation.ts:40-120`) sends `browser.tabCreate` with no placement from a paired caller, and PB's engine-less orcad answers `browser_unavailable` (measured). With `placement: { kind: 'client', browserHostClientId }` from the same paired device, the page arrives as `createPage` (measured). orcad refuses a client placement whose caller device differs from the host lease's device (`browser_host_lease_stale`, `browser-host-client-page-creation.ts:47-48`), and Orca's web client migrates its pairing to a forked device-key row with a new device id (`device-key-fork.ts:59-70`). P66-10's derivation must include the callers of `createWebRuntimeSessionBrowserTab` beside those of `createBrowserTab`, and its "arrives as `createPage`" clause needs a PB placement override and one paired device for both clients.
3. **Page dialogs in an agent tab work chrome-side but block the IDE while open.** `alert`, `confirm` and `prompt` from the hidden agent overlay open the stock window-modal `commonDialog` in 253 to 760 ms (`modalType` 3). Chrome maps it to the agent tab through `args.owningBrowsingContext.top.embedderElement`, answers it through the dialog's own `acceptDialog`/`cancelDialog`, and the page receives `"returned"`, `false` and the typed text. A frontend-to-chrome request round trip completes in 5 to 7 ms while the dialog is open, so `webTabAgent` stays usable. The cost is the one Phase 37 recorded: the shell's input is disabled until the dialog is answered (`shellInputEnabled: false`). P66-15 resolves to `native`. Owner item O2.
4. **The snapshot format agents read comes from `agent-browser` 0.39.4, not from `snapshot-engine.ts`.** Orca's `browser.snapshot` runs the pinned `agent-browser` binary (`agent-browser-bridge-core-commands.ts:23-46`, `"agent-browser": "~0.39.4"` at `orca/package.json:235`). `snapshot-engine.ts` is reached only through `CdpBridge`, which nothing constructs. Reference fixtures were generated by running the pinned binary against Chromium 157 on this host and are kept under the spike folder. P66-16's reference source and fidelity measure change.
5. **The actor child needs `Cc[` and `Ci.` added to its boundary allowance.** Trusted key events need `nsITextInputProcessor`, and console capture needs `nsIConsoleAPIStorage` plus a system principal; both are reached only through `Cc[...]`/`Ci.`. Pointer, wheel and text insertion need no allowance change (`Window.synthesizeMouseEvent`, `windowUtils.sendWheelEvent`, `windowUtils.sendContentCommandEvent` match no forbidden pattern). P66-13's conditional fires.
6. **The thin client needs legacy framing.** Orca's v2 token auth carries no client capabilities ("Why no capabilities: v2 token auth is an exact key set on every host", `paired-e2ee-client-handshake.ts:193`), and the attach handler requires `browser.clientHost.v1` in them. Legacy framing with the offer token carries them through `sealAuth`'s public `clientCapabilities` option, which is what the measured client used. The bundle is 135,849 bytes from 123 modules (the proof's was 19.3 MB).

**Primary recommendation:** Keep the S2 route and the lane cut. Before the lanes start, adopt the five amendments below: parked agent overlays with one chrome visibility predicate (A1), the `Cc[`/`Ci.` actor-child allowance (A2), a PB placement override plus one paired device for renderer-created pages (A3), `native` dialogs with an owner item on the IDE block (A4), and agent-browser 0.39.4 as the snapshot reference (A5).

## Gate answers (P66-04)

Each answer cites the run file and the field. "dpr1" is `results-p66-gate-dpr1.json` (with orcad); "dpr2" is `results-p66-gate-dpr2.json` (no orcad, Q3 only).

| # | Question | Answer | Evidence |
|---|---|---|---|
| G1 | Does the thin S2 client attach without any private Orca member (P66-02)? | Yes. Legacy framing, offer token, capabilities through `sealAuth`'s option; one socket carries `status.get`, the attach stream and every `commandResult`. | dpr1 `orca.attach = {ready: "accepted", statusOk: true, secure: true}`; `orca.thinBundleBytes = 135849`; the built bundle contains 0 matches for `subscribeOnCurrentConnection`, `WEB_RUNTIME_CLIENT_CAPABILITIES` and `WebRuntimeClient` [VERIFIED: run] |
| G2 (Q3) | Does input reach a hidden tab without focus, and do coordinates align at DPR 1 and 2? | Only when the overlay is parked (occluded-visible). Hidden: events dispatch trusted but hit `#document` (never shown) or hit the target but cannot focus (shown then hidden). Parked: click hits, `focus()` moves inside the agent document only, keys and insertText give `"abxyz"`, user focus untouched. Pointer coordinates are CSS px; screenshot pixel = CSS × DPR at 1 and 2. | dpr1/dpr2 `q3.variants.{neverShown,shownThenHidden,occludedVisible}`; dpr2 `occludedVisible.screenshot.px` red at (240,200) and (204,164), white at (194,200) for a target at CSS (100,80) 40×40 [VERIFIED: run] |
| G3 (Q5) | Where do page dialogs surface under PB's prompt code, and can chrome resolve them by tab? | Stock window-modal `commonDialog`; owner tab id derivable; chrome answers; bridge round trip works while open; IDE input disabled while open. | dpr1/dpr2 `q5.rows[*]`: `facts.ownerTabId` = the agent tab, `modalType: 3`, `shellInputEnabled: false`, `roundTripMs` 5-7, `pageResult` `"returned"`/`false`/`"p66-text"` [VERIFIED: run]; prior verdict `.planning/probes/prompt-probe-verdict.json` `outcome: "stock-blocks-ide"` |
| G4 (Q4) | One row per mechanism: actor and native? | Actor: `click` through `Window.synthesizeMouseEvent` in the child fires `click:t:true` (parked and shown-then-hidden). Native: `drawSnapshot` on the overlay's window global captures even a hidden 0×0 overlay with the target pixel in place. | dpr1 `q4.clickThroughChild = {neverShown: false, shownThenHidden: true, occludedVisible: true}`; `q4.screenshotHiddenOverlay` [VERIFIED: run] |
| G5 | Does one P64-07 offer admit two paired clients? | Yes. A second connection from the same offer authenticated while the first stayed attached; both answered. Source: a device-key migration forks a new keyed row "while retaining other token holders/sockets" (`device-key-fork.ts:22`). | dpr1 `orca.secondClient = {connected, statusOk, tabListOk, firstStillOk}` all true [VERIFIED: run] |
| G6 | How does `createBrowserTab` reach orcad and `createPage` in the web build? | In a paired web session the UI creation sites call `createWebRuntimeSessionBrowserTab` (`use-terminal-create-actions.ts:104,155`, `useTabGroupCreationCommands.ts:83`, `workspace-browser-tab-open.ts:238`, `browser-reopen-on-server.ts:30`; grep, not traced per caller), not only the store's `createBrowserTab` (`browser-tab-actions.ts:38`). It calls `prepareBrowserClientHostPlacement` (web preload: `{ kind: 'server' }`) → `browser.tabCreate` with no placement → orcad forwards to the absent engine → `browser_unavailable`. With client placement and the same paired device → `createPage`. CLI `tab create` (no paired caller) → `createBrowserPageOnPairedHost` → `createPage` in 165 ms. | dpr1 `orca.rendererPath.noPlacement.code = "browser_unavailable"`, `clientPlacement.ok = true`, `events` two `createPage:completed:acked`; `orca.cliTabCreate.ms = 165`, `afterCreate.mappedIsCurrent = false` [VERIFIED: run]; `orcad-client-page-commands.ts:104-115` [VERIFIED: source read] |
| G7 | Which host call reports a page the user closed? | `browser.tabClose { worktree, page }` on the host's own connection. orcad then sends `closePage` to the host, which answers `completed`; the reply is `{ closed: true }` and `tab list` no longer lists the page. The trigger is the web-tab widget's `disposed` signal. | dpr1 `orca.userClose = {userClosedSeen: true, reply: {closed: true}, eventsAfter: ["closePage:completed:acked"]}`, `listAfterClose.stillListed = false` [VERIFIED: run]; Orca's own renderer does the same (`client-hosted-browser-row-close.ts`) |
| G8 | Console mechanism? | Child-side `nsIConsoleAPIStorage.addLogEventListener`, filtered by the window's `innerWindowId`, captured `log`, `warn` and `error` with their arguments from the hidden agent tab. | dpr1/dpr2 `console.captured` [VERIFIED: run] |
| G9 | Snapshot reference fixtures and DOM-derived role fidelity? | Reference = `agent-browser` 0.39.4 run against Chromium on a fixture page; fixtures kept in `p66-snapshot-reference/`. Grammar `- <role> "<name>" [<attrs>, ref=eN]`; refs object `{eN: {role, name}}`; delta kinds `full`/`unchanged`/`delta` with `revision`/`baseRevision`; refs survive a DOM change. Chromium-internal roles (`StaticText`, `LabelText`, `MenuListPopup`, `generic`) cannot be reproduced from the DOM byte for byte; fidelity must be structural. | `p66-snapshot-reference/form.snapshot.{txt,json}`, `form.snapshot-i.txt` [VERIFIED: run of the pinned binary] |
| G10 | Does windowUtils input synthesis in the child need a boundary allowance change (P66-13)? | Pointer, wheel and insertText: no. Keys and console: yes, `Cc[` and `Ci.` in `ACTOR_CHILD_PATTERNS`, one catalogue row per occurrence. | `scripts/check-internals-boundary.sh:115` quotes `ACTOR_CHILD_PATTERNS=('wrappedJSObject' 'JSWindowActorChild')`; the probe child's `key` and `console` arms are the only ones using `Cc`/`Ci` [VERIFIED: source read + run] |
| G11 | Orca error codes for refusal and Stop | orcad refuses an id it does not know itself (`browser_unavailable`, never reaches the host). A host `failed` result reaches the CLI as `runtime_error` with the host's code as the message. Pick: unmapped id → `browser_tab_not_found`; Stop → `browser_owner_unavailable`; unserved → `browser_command_unavailable`. | dpr1 `orca.unknownPage = {errorCode: "browser_unavailable"}`, `orca.cliUnservedCommand = {errorCode: "runtime_error", errorMessage: "browser_command_unavailable"}` [VERIFIED: run]; `runtime-browser-client-automation.ts:39-43` maps `failed` to `new Error(result.errorCode)` |

## Context amendments

The P66 picks stand except as below. Each amendment names the measurement that forces it. Chris may override any of them in the end-of-milestone pass, like the picks themselves.

| Id | Pick | Amendment | Why (evidence) |
|---|---|---|---|
| A1 | P66-07, P66-14 | An agent tab that is not the current widget is **parked**, not hidden: chrome sets `visibility: visible`, `zIndex: "-1"`, the main-area box sent by the frontend, and leaves `docShellIsActive` `false`. The frontend's `publish()` sends the main panel's rect for an unshown agent widget (`visible: false`, real `w`/`h`); `webTabGeometry` applies the parked placement for entries with the agent flag and the stock hidden placement for all others. One chrome predicate, `overlayShownToUser(browser)` (visible and not parked), replaces the seven `style.visibility === "visible"` reads in `PowerBrowserAPI.sys.mjs` (`:4177`, `:7016`, `:8603`, `:8789`, `:9351`, `:9436`, `:9481`). The P66-14 fallback (briefly made visible, focus cost) is not needed. | G2: never-shown inner `[0,0]`, hidden focus refused, parked all rows pass with `userBlurred: []` and `chromeActiveAfter` = the user's tab at DPR 1 and 2. Without the predicate, `shouldActivateDocShell` (`:7016`) and the find/fullscreen/pointer-lock sites would treat a parked agent tab as the shown tab. |
| A2 | P66-13 | The conditional fires: `ACTOR_CHILD_PATTERNS` gains `'Cc['` and `'Ci.'` in the commit of their first use (lane p66-03), with one `INTERNAL-APIS.md` row per occurrence (expected: the TIP constructor and interface, the console storage service and interface, the system principal constructor and interface). The self-test (`check-internals-boundary.sh --self-test`, the `self-test-child` case near `:446`) gains a plant for each new pattern on an uncatalogued line. `Services.`, `Cu.` and `nodePrincipal` stay forbidden in the child. | G10. Keys without TIP would be untrusted or lack `keydown`; `sendContentCommandEvent("insertText")` gives trusted `beforeinput`/`input` but no key events (dpr1 `occludedVisible.keyEvents`). |
| A3 | P66-09, P66-10, P66-30 (`orca-browser-agent-live` last clause) | Renderer-created browser pages need two things the context did not list: (a) PB code in the pane bundle (P64's entry, a PB file) replaces `window.api.runtimeEnvironments.prepareBrowserClientHostPlacement` with one that returns `{ kind: 'client', browserHostClientId: <the thin host's id> }` (the thin host exposes its id through `@powerbrowser/orca-browser`), and (b) the thin host and the pane bundle's client authenticate as **the same paired device**. Recommended route for (b): the thin host authenticates with the pane bundle's stored credential when Orca's web session has migrated it to a device key (v2 key auth carries capabilities), else with the offer token over legacy framing. The live clause stays, and it must name the device check. P66-10's entry-point derivation adds the callers of `createWebRuntimeSessionBrowserTab` (`src/renderer/src/runtime/web-runtime-browser-creation.ts`) to those of `createBrowserTab`. Until P64 merges, CLI-created pages (no paired caller) are the proven path. | G6: default renderer path → `browser_unavailable`; client placement from the same device → `createPage`. Source: `browser-host-client-page-creation.ts:47-48` throws `browser_host_lease_stale` on a device mismatch; `device-key-fork.ts:59-70` gives the migrated client a new `deviceId`. |
| A4 | P66-15, P66-11 "per Q5 (2)" | `dialogAccept`/`dialogDismiss` are `native`: chrome finds the open `chrome://global/content/commonDialog.xhtml` window whose `args.owningBrowsingContext.top.embedderElement` is the agent overlay, sets `loginTextbox` for a prompt's text, and calls `acceptDialog()` or `cancelDialog()`; with none open it answers `browser_no_dialog` (Orca's code, `agent-browser-bridge-page-commands.ts:77`). The answer is `{ accepted }` as in Orca. Owner item O2 records the IDE block. | G3. |
| A5 | P66-16, P66-30 (`orca-browser-snapshot-live`) | The reference format is `agent-browser` 0.39.4's, not `snapshot-engine.ts`'s (`[@eN] role "name"`, dead in the pin). Fixtures are generated by a script that runs the binary from `orca/node_modules/agent-browser/bin/` with `AGENT_BROWSER_EXECUTABLE_PATH` set to a Chromium, records the agent-browser version in the fixture, and is re-run when `orca/package.json`'s `agent-browser` range or lockfile version changes; the check fails when the recorded version differs from the pin. Fidelity is compared structurally: line grammar, the multiset of `(role, name)` for ref'd nodes, the attribute tokens (`level`, `checked`, `expanded`, `selected`), the delta kinds and ref survival. Byte equality and ref numbering are not compared. The result shape is agent-browser's JSON passed through, plus `browserPageId`, `url`, `title` (what Orca's desktop host returns, `agent-browser-bridge-core-commands.ts:40-45`). | G9. |
| A6 | P66-05 | The host's refusal of an unmapped id remains the second line, but its usual trigger is narrower than written: orcad refuses ids it does not know before the host sees them (`browser_unavailable`). The host refusal covers ids orcad still routes to this host (after a frontend reload, before recovery). The refusal code stays `browser_tab_not_found`. | G11. |
| A7 | P66-08 | The user-close report is `browser.tabClose { worktree, page }` from the thin host, triggered by the mapped widget's `disposed` signal; the host drops the pair first and answers the following `closePage` with `completed`. A frontend reload does not send it (the client dies with the frontend; orcad's recovery handles those pages). | G7. |
| A8 | P66-22, Claude's discretion (codes) | Stop answers `failed` with `browser_owner_unavailable`; unserved methods `browser_command_unavailable`; unmapped ids `browser_tab_not_found`. All three are members of Orca's `BrowserErrorCode` union (`runtime-browser-contracts.ts:235-255`). | G11. |
| A9 | P66-02 | The thin client uses legacy framing with the offer token (or v2 device-key auth per A3), never v2 token auth, because v2 token auth sends no capabilities. It answers WebSocket pings automatically (the browser does), so no application heartbeat is needed for orcad's reaper (`remote-runtime-server-heartbeat.ts:63-91` pings and terminates sockets that miss probes). | G1; source read. |

**Owner items added (end-of-milestone pass, D-18):**
- **O1 (A1):** a parked agent page reports `document.visibilityState === "hidden"` and runs with background timer throttling (`docShellIsActive` false). Activating it while an agent command runs would remove throttling but makes the page paint while unseen. Recommendation: keep it inactive; revisit if a live agent run shows `wait` stalls.
- **O2 (A4):** a page dialog in an agent tab opens a window-modal dialog over the IDE and disables the shell's input until the agent or the user answers it. Alternatives: auto-answer agent-tab dialogs as Orca's CDP listener does (`cdp-debugger-events.ts:16-24`: accept unless `beforeunload`), which changes `dialogAccept`/`dialogDismiss` to `browser_no_dialog`; or the PROMPT-03 tab-dialog host deferred on 2026-11-03 (`.planning/v1.5-LIVE-PASS.md:108`).

## Project Constraints (from CLAUDE.md)

- Never fork or patch Theia core; `@powerbrowser/*` extensions only (`scripts/diff-theia-core.sh`).
- Firefox internals only through `powerbrowser/shell/PowerBrowserAPI.sys.mjs`, every touchpoint catalogued in `powerbrowser/INTERNAL-APIS.md`; `GroupActorChild.sys.mjs` is the one other file, limited to `ACTOR_CHILD_PATTERNS` with a row per occurrence (`scripts/check-internals-boundary.sh`, `--self-test`, `--catalogue`). Amendment A2 widens that list by two patterns through the NG-039 procedure.
- Never modify Gecko outside the patch stack; `git -C upstream diff` stays empty. No new chrome file in this phase, so no `jar.mn`/`moz.build` change.
- Design for the bridge: `TabUriRegistry`'s exported shape stays (`scripts/verify-registry-shape.mjs`).
- Repo path without a space.
- Theia is the default GUI; no custom browser chrome beyond the existing chrome bar. The mark lives in the chrome bar; stock windows unchanged.
- The residual-brand scan is permanent; stage new files before trusting it; new Orca-naming paths get brand rows (coordinator).
- Patches are regenerated, never hand-edited (no seam in this phase).
- One verification driver, one registry (`scripts/verify-platform.sh`); a check is one row plus a `-self-test` row; never assert an absence without proving the detector; derive and compare as sets.
- No internal identifier in user-facing copy (`shell-error-copy-no-internals`); errors name "PowerBrowser" and end with a real next step.
- Builds run in Nix dev shells (`nix develop .#firefox`, `.#theia`, `.#orca`); chrome JS edits need `-purgecaches` (`MOZ_PURGE_CACHES=1` in the harness).
- Live runs only under `flock /home/chris/coding/Power-Browser/.git/pb-live.lock`, with inherited `ORCA_*` unset; never print orcad's ready line, pairing URLs or tokens.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Paired E2EE connection, attach, command results, page metadata, user-close report | Theia frontend (`@powerbrowser/orca-browser`, thin client bundle) | orcad (protocol authority) | P66-01; measured working from the frontend document (G1, G7). |
| `browserPageId` ↔ web-tab table (first wall) | Theia frontend | — | P66-05; the frontend creates the widgets. |
| Agent flag, method allowlist, Stop state, mark state (second wall) | Gecko chrome (`PowerBrowserAPI.sys.mjs`) | — | P66-06, P66-20; chrome acts on pages. |
| Parked placement of unshown agent overlays | Gecko chrome (`webTabGeometry`) | Theia frontend (sends the main-area box) | A1. |
| Pointer, key, text, page-world eval, value set, waits, console, snapshot | Content process (`PowerBrowserAgent` child) | Chrome (routes by tab id) | G2, G8, P66-16. |
| Screenshot, full screenshot, PDF, cookies, network observers, dialogs | Gecko chrome | Child (document size for full screenshot) | G3, G4. |
| Mark and Stop UI | Theia frontend (chrome bar) | Chrome (state push) | P66-20/21. |
| Renderer-created page routing | Theia frontend (pane bundle placement override) | orcad | A3. |

## Standard Stack

### Core (reuse, do not rebuild)
| Component | Version / location | Purpose | Why |
|---|---|---|---|
| Orca shared modules | Orca 1.4.248 pin: `src/shared/paired-e2ee-client-handshake.ts` (`createPairedE2EEClientHandshake`, `sealAuth`, `classifyAuthReply`), `paired-runtime-connection.ts` (`pairedRuntimeConnectionFromOffer`), `web-origin-security.ts` (`withWebClientUpgradeMarker`), `browser-runtime-capabilities.ts`, `browser-client-host-protocol.ts` (`BrowserClientHostEvent`, zod), `browser-client-automation-protocol.ts`, `browser-client-page-metadata-protocol.ts` | Handshake, framing, protocol types and validation | Public exports; the measured client used exactly these (G1). |
| Orca web modules (not `web-runtime-client.ts`) | `src/renderer/src/web/web-pairing.ts` (`parseWebPairingInput`), `web-paired-e2ee-primitives.ts` (`WEB_PAIRED_E2EE_PRIMITIVES`) | Offer parse, browser crypto primitives | Same modules Orca's web client uses; 123 modules total. |
| Orca's Vite (`orca/node_modules/vite`, v8.3.5 in the run) with a PB library config | `orca-overlay/files/...` per P66-02 | Builds the IIFE bundle | Measured `build-p66-thin-host.sh`: PASS, tracked state unchanged. |
| `WindowGlobalParent.drawSnapshot` | Gecko 153.5.x, chrome | screenshot rows | Measured on hidden and parked overlays (G4). |
| `Window.synthesizeMouseEvent` (ChromeOnly), `windowUtils.sendWheelEvent`, `windowUtils.sendContentCommandEvent` | content child | pointer, wheel, text insertion | Measured trusted events (G2). |
| `nsITextInputProcessor` | content child, via `Cc`/`Ci` | key rows | Measured trusted `keydown`/`keyup`/`input` (G2). |
| `nsIConsoleAPIStorage` | content child, via `Cc`/`Ci` | `console`, capture half | Measured (G8). |
| Stock `commonDialog` window + `args.owningBrowsingContext` | chrome | dialog rows | Measured (G3). |
| `agent-browser` 0.39.4 binary (`orca/node_modules/agent-browser/bin/agent-browser-linux-x64`) + Chromium | fixture generation only (dev host) | snapshot references | The format agents read (G9). Never shipped. |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|---|---|---|
| Parked overlay (A1) | Briefly make the overlay visible on top for each input call (P66-14 fallback) | Flashes the page over the user's tab and needs chrome focus for parent-side input; rejected by measurement (parked works with no focus move). |
| TIP keys in the child | Parent-side TIP on the shell window | Parent TIP targets the focused content; needs the overlay focused, which moves the user's focus. |
| Child console listener | Parent `nsIConsoleService` listener filtered by `innerWindowID` | Sees script errors only, not `console.log`; usable for the error half without a child allowance, but the key rows already need `Cc`/`Ci`. |
| Thin client reading the pane bundle's credential (A3 route b) | Keep the pane bundle on token auth | Not controllable without an Orca patch; Orca's web session sets `allowKeyMigration: true` (`web-runtime-session.ts:107`). |
| Shared Node client `RemoteRuntimeRequestConnection` (`src/shared/remote-runtime/requests/`) | as the thin client | Imports the Node `ws` package; would need an alias shim. Not needed. |

**Installation:** none. No package is added to Theia, Orca or the shell. The thin client is PB overlay files compiled from Orca's installed `node_modules`.

## Package Legitimacy Audit

No external package is installed by this phase. `agent-browser` is already a pinned Orca dependency (`orca/package.json:235` `"agent-browser": "~0.39.4"`), used here only to generate fixtures on the developer host; Chromium is the host's system package.

| Package | Registry | Age | Downloads | Source Repo | Verdict | Disposition |
|---------|----------|-----|-----------|-------------|---------|-------------|
| (none added) | — | — | — | — | — | — |

**Packages removed due to [SLOP] verdict:** none
**Packages flagged as suspicious [SUS]:** none

## Architecture Patterns

### System Architecture Diagram

```
 Orca CLI / agent (terminal)                Orca renderer (pane bundle, P64)
        | browser.* RPC                               | browser.tabCreate (+ PB placement override, A3)
        v                                             v
 +--------------------------- orcad (PB-run, no engine) ----------------------------+
 |  page registry, lease registry (keyed by browserHostClientId + connection)       |
 |  no engine -> every page is client-hosted; unknown page id -> browser_unavailable|
 +-----------------------------------+----------------------------------------------+
                                     | attach stream (createPage, navigate, automation,
                                     | closePage, reclaim/restore, switchProfile)
                                     v
 +---------------- Theia frontend: @powerbrowser/orca-browser --------------------+
 | thin client (one WebSocket, legacy framing, caps browser.clientHost.v1 +       |
 |   browser.clientHost.pageMetadata.v1)                                          |
 | page table browserPageId <-> tabId (wall 1)  -- unmapped -> browser_tab_not_found|
 | dispatcher: createPage -> WebTabOpenHandler.openInBackground(agent:true)        |
 |             navigate   -> webTabNavigate                                        |
 |             automation -> webTabAgent {tabId, method, params} | unserved -> browser_command_unavailable |
 |             closePage  -> close widget, completed                               |
 | widget.disposed (user close) -> browser.tabClose {worktree, page}               |
 | loaded/title pushes -> browser.clientHost.pageMetadata                          |
 +-----------------------------------+--------------------------------------------+
                                     | WebTabChannel request (group actor)
                                     v
 +---------------- Gecko chrome: PowerBrowserAPI (end-of-file section) ------------+
 | wall 2: entry.agent set at webTabOpen only; AGENT_METHODS frozen list;          |
 |   not-agent-tab / unknown-tab / agent-stopped                                   |
 | parked placement for unshown agent overlays (A1)                                |
 | native rows: drawSnapshot, print, cookies (agent container), network, dialogs   |
 | mark state: lit on webTabAgent, 20 s idle, Stop -> agentControlChanged push     |
 +-----------------------------------+--------------------------------------------+
                                     | getActor("PowerBrowserAgent") on the overlay's window global
                                     v
 +------------- content process: PowerBrowserAgent child (GroupActorChild.sys.mjs) -+
 | synthesizeMouseEvent / sendWheelEvent / TIP keys / insertText / page-world eval |
 | value set + input/change, waits, console storage listener, snapshot + ref table |
 +----------------------------------------------------------------------------------+
```

### Pattern 1: Parked agent overlay (A1)
**What:** An agent overlay that is not the current widget keeps a real box and `visibility: visible` but sits at `z-index: -1`, under the Theia frame (`z-index` 0) and every shown overlay (`z-index` 1). Its docshell stays inactive.
**When:** every agent overlay whose widget is not shown. A shown agent tab uses the stock visible placement; a user tab is never parked.
**Measured:** dpr1/dpr2 `occludedVisible`: `hitAtTargetCenter: "t"`, `clickHitTarget: true`, `focusInput: "in"`, `inputValue: "abxyz"`, `focus.chromeActiveAfter` = the user tab, `userHasFocusAfter: true`, `userBlurred: []`, `agentHasFocusAfter: false`, `chromeTopAtTargetCenter` = the user tab.

```js
// chrome, inside webTabGeometry for an entry with entry.agent (sketch; names are the plan's to fix)
const parked = !visible && entry.agent;
Object.assign(entry.browser.style, {
  left: `${host.left + left}px`, top: `${host.top + top}px`,
  width: `${width}px`, height: `${height}px`,
  visibility: visible || parked ? "visible" : "hidden",
  zIndex: parked ? "-1" : "1",
});
entry.parked = parked;
entry.browser.docShellIsActive = !!visible;
// every "is this overlay shown to the user" read goes through one predicate
const overlayShownToUser = b => b.style.visibility === "visible" && !webTabs.get(tabIdOfBrowser(b))?.parked;
```
`zIndex: "1"` and `visibility: "hidden"` are the values `webTabOpen` already writes (`PowerBrowserAPI.sys.mjs:3620-3621`, quoted `zIndex: "1",` and `visibility: "hidden",`); `"-1"` and `parked` are new [ASSUMED names].

### Pattern 2: Thin client authentication (G1, A9)
```ts
// Source: .planning/spikes/005-orca-browser-parity/p66-thin-host.ts (measured)
const handshake = createPairedE2EEClientHandshake({
  primitives: WEB_PAIRED_E2EE_PRIMITIVES,
  hostPublicKeyB64: connection.hostPublicKeyB64,
  framing: 'legacy'
})
// after acceptReadyText(frame) === 'accepted':
ws.send(await handshake.sealAuth({ kind: 'token', deviceToken },
  { clientCapabilities: [BROWSER_CLIENT_HOST_RUNTIME_CAPABILITY, BROWSER_CLIENT_PAGE_METADATA_RUNTIME_CAPABILITY] }))
// every request: ws.send(handshake.channel.sealText(JSON.stringify({ id, deviceToken, method, params })))
```
Values: `BROWSER_CLIENT_HOST_RUNTIME_CAPABILITY = 'browser.clientHost.v1'` and `BROWSER_CLIENT_PAGE_METADATA_RUNTIME_CAPABILITY = 'browser.clientHost.pageMetadata.v1'` [VERIFIED: orca/src/shared/browser-runtime-capabilities.ts:10-12]; host capabilities `'webview'` (Orca keeps it in `src/main`, quoted by the proof at `s2-host.ts`) and `BROWSER_CLIENT_AUTOMATION_HOST_CAPABILITY = 'automation-v1'` [VERIFIED: orca/src/shared/browser-client-automation-protocol.ts:4].

### Pattern 3: Input in the child (G2)
```js
// Source: p66-probe-child.sys.mjs (measured); the PowerBrowserAgent child does the same
win.synthesizeMouseEvent(type, x, y, { button, clickCount, inputSource: win.MouseEvent.MOZ_SOURCE_MOUSE }, { isDOMEventSynthesized: true });
win.windowUtils.sendWheelEvent(x, y, 0, dy, 0, win.WheelEvent.DOM_DELTA_PIXEL, 0, 0, 0, 0);
const tip = Cc["@mozilla.org/text-input-processor;1"].createInstance(Ci.nsITextInputProcessor); // needs A2
if (tip.beginInputTransactionForTests(win)) { const ev = new win.KeyboardEvent("", { key, code, keyCode }); tip.keydown(ev); tip.keyup(ev); }
win.windowUtils.sendContentCommandEvent("insertText", null, text);
```
`x`, `y` are CSS pixels of the page viewport at every DPR (G2, dpr2).

### Pattern 4: Native screenshot (G4)
```js
// chrome; scale = the overlay window's devicePixelRatio so the image is in device px
overlay.browsingContext.currentWindowGlobal.drawSnapshot(new window.DOMRect(x, y, w, h), dpr, "rgb(255,255,255)")
```
The result travels as base64 inside `BROWSER_CLIENT_AUTOMATION_RESULT_MAX_BYTES = 768 * 1024` [VERIFIED: orca/src/shared/browser-client-automation-protocol.ts:8]; see Pitfall 4.

### Pattern 5: Dialog resolution (G3, A4)
```js
// chrome
for (const w of Services.wm.getEnumerator(null)) {
  if (w.location?.href !== "chrome://global/content/commonDialog.xhtml") continue;
  const owner = w.args?.owningBrowsingContext?.top?.embedderElement;
  if (owner !== agentOverlay) continue;
  if (text != null) { const e = w.document.getElementById("loginTextbox"); e.value = text; e.dispatchEvent(new w.Event("input", { bubbles: true })); }
  const dlg = w.document.getElementById("commonDialog");
  accept ? dlg.acceptDialog() : dlg.cancelDialog();
}
```
`commonDialog.js` exposes `args` from the property bag (`upstream/toolkit/components/prompts/content/commonDialog.js:23-32`); `PromptParent` puts `owningBrowsingContext` into it before the window-modal fallback (`upstream/browser/actors/PromptParent.sys.mjs:217`, window-modal fallback `:296-307`).

### Pattern 6: User close report (G7, A7)
```js
widget.disposed.connect(() => {
  if (table.get(pageId) !== widget.tabId) return;      // closed by closePage: already dropped
  table.delete(pageId);
  void client.call('browser.tabClose', { worktree: `path:${worktreePath}`, page: pageId });
});
// the following closePage command for pageId is answered { status: 'completed' }
```

### Anti-Patterns to Avoid
- **Opening agent tabs hidden and driving them hidden.** Measured: 0×0 viewport, no focus (G2).
- **Using `style.visibility === "visible"` as "the user sees it" after A1.** Seven sites would misread a parked overlay.
- **v2 token auth for the thin client.** No capabilities travel; attach fails with `browser_client_host_capability_required`.
- **Answering a dialog by synthesising Enter.** Needs focus in the dialog window; use the dialog's own `acceptDialog`/`cancelDialog`.
- **Comparing snapshots byte for byte with agent-browser.** Chromium-internal roles and ref numbering are not reproducible from the DOM.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| E2EE handshake, framing, auth | Own crypto or framing | `createPairedE2EEClientHandshake` + `WEB_PAIRED_E2EE_PRIMITIVES` | Exact transcript and key handling; measured. |
| Protocol validation | Hand checks of event shapes | `BrowserClientHostEvent.safeParse`, `BrowserClientHostCommandResultParams` | Same zod schemas orcad applies. |
| Trusted key events | `dispatchEvent(new KeyboardEvent)` from page world | `nsITextInputProcessor` in the child | Page-world events are untrusted; sites ignore them. |
| Page dialogs | A PB dialog UI or a page-world `alert` override | Stock `commonDialog` + `acceptDialog`/`cancelDialog` | Measured; keeps PROMPT-03 out of scope. |
| Screenshots | Canvas rendering in the page | `drawSnapshot` | Works on hidden and parked overlays (G4). |
| Snapshot references | Hand-written expected trees | Fixtures generated by the pinned `agent-browser` binary | Derived output, re-generated on re-pin (A5). |

**Key insight:** every protocol and Gecko mechanism this phase needs already exists and was run here; the new code is routing, walls and the snapshot tree.

## Runtime State Inventory

Not a rename or migration phase: omitted.

## Common Pitfalls

### Pitfall 1: Never-shown background tabs have no viewport
**What goes wrong:** `openInBackground` creates the overlay at `0px × 0px`; nothing resizes it until shown. Clicks hit `#document`; `elementFromPoint` returns null.
**How to avoid:** A1 parked placement with the main-area box.
**Warning signs:** `innerWidth === 0` in the agent child; pointer events targeting `#document`.

### Pitfall 2: `visibility: hidden` blocks focus in the remote document
**What goes wrong:** `focus()` in a document whose embedder is `visibility: hidden` does nothing; keys go to `BODY`.
**How to avoid:** parked placement; `visibility: visible` under the Theia frame.

### Pitfall 3: The user's IDE is blocked while an agent tab's dialog is open
**What goes wrong:** the window-modal dialog disables the shell's input (`shellInputEnabled: false`).
**How to avoid:** none within A4; owner item O2. The bridge itself keeps working (round trip 5-7 ms).

### Pitfall 4: Results over 768 KiB are rejected
**What goes wrong:** `browser.clientHost.commandResult` params are zod-checked against `BROWSER_CLIENT_AUTOMATION_RESULT_MAX_BYTES = 768 * 1024`; a base64 PNG of a full page at DPR 2 can exceed it, and the command fails.
**How to avoid:** the screenshot rows fall back to JPEG and then to a smaller scale before answering; a result that still does not fit answers `failed` with `browser_error` [ASSUMED fallback order; Orca's desktop host has no such fallback in the pin].

### Pitfall 5: The device behind a client placement must match the host's device
**What goes wrong:** `browser_host_lease_stale` when the pane bundle's client (device-key fork) creates a client-placed page on the thin host (token row).
**How to avoid:** A3 (b).

### Pitfall 6: Chrome JS startup cache
**What goes wrong:** edits to `powerbrowser/shell/*.sys.mjs` do not run in a live check.
**How to avoid:** the harness sets `MOZ_PURGE_CACHES=1` (`scripts/lib/pb-live-probe.mjs` `withProbeShell`).

### Pitfall 7: The content sandbox cannot read profile files
**What goes wrong:** a JSWindowActor child module loaded through a `resource://` substitution into the profile directory never loads (first probe run: actor timeout). Product code is unaffected (the child is in the app's chrome package), but any live harness that registers a test actor must put the module under the application directory.

### Pitfall 8: Orca wraps host error codes
**What goes wrong:** a host `failed` with `errorCode` reaches the CLI as `{ code: "runtime_error", message: <errorCode> }`. A check that expects the host's code in `error.code` stays red.
**How to avoid:** live checks read `error.message` for host codes and `error.code` for orcad's own codes (dpr1 `cliUnservedCommand`, `unknownPage`).

### Pitfall 9: The page table is the first wall, not the only one
**What goes wrong:** the Theia document also runs Orca's renderer code (P64-07); a bug there could send `webTabAgent` for any tab id.
**How to avoid:** chrome's agent flag set at `webTabOpen` only (P66-06); `orca-browser-tab-scope` plants a flag honoured on `already-open`.

## Code Examples

The patterns above are the examples; each was taken from the measured probe files:
- `.planning/spikes/005-orca-browser-parity/p66-thin-host.ts` (Pattern 2)
- `.planning/spikes/005-orca-browser-parity/p66-probe-child.sys.mjs` (Patterns 3, console listener)
- `.planning/spikes/005-orca-browser-parity/p66-gate-probe.mjs` (`snapshotPixels`, `dialogFacts`, `answerDialog`, `HOST_SETUP` for Patterns 4-6 and the page table)

Console listener (G8, child; needs A2):
```js
const storage = Cc["@mozilla.org/consoleAPI-storage;1"].getService(Ci.nsIConsoleAPIStorage);
const principal = Cc["@mozilla.org/systemprincipal;1"].createInstance(Ci.nsIPrincipal);
const innerID = win.windowGlobalChild.innerWindowId;
storage.addLogEventListener(msg => { const m = msg.wrappedJSObject || msg; if (m.innerID === innerID) buffer.push({ level: m.level, args: m.arguments.map(String) }); }, principal);
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|---|---|---|---|
| Proof S2 host over `WebRuntimeClient` with two reaches (19.3 MB) | Thin client over shared modules (135,849 bytes) | This research | Condition 1 met without upstream exports. |
| `snapshot-engine.ts` format `[@eN] role "name"` | `agent-browser` 0.39.4 `- role "name" [ref=eN]` | Orca's agent path uses the binary at the pin | A5. |
| Dialog rows labelled `BiDi` | `native` chrome-side | This research | A4. |

**Deprecated/outdated:** `DISPOSITIONS.md` rows for the 34 BiDi/BiDi+ tier-1 abilities no longer describe what is built (already noted in 66-CONTEXT "Corrections"); the `Q3`, `Q5` `[ASSUMED]` marks in spike 005's README are answered here.

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A-1 | Orca's web session in P64's pane bundle migrates the pairing to a device key in the Theia document, so its device id differs from the offer token's. | Amendment A3, Pitfall 5 | If it does not migrate, A3 (b) is unnecessary; the live clause shows which. |
| A-2 | A parked page with `docShellIsActive` false behaves well enough for `wait` and SPA rendering. | O1 | `wait` stalls on pages that need `requestAnimationFrame`; mitigation is activating during commands. |
| A-3 | Screenshot fallback order (PNG, JPEG, smaller scale). | Pitfall 4 | Large screenshots fail with a defined error instead. |
| A-4 | Uncaught page errors are captured with a child `error` listener on the content window. | G8 | Console rows miss uncaught exceptions; add chrome-side `nsIConsoleService` filtering by `innerWindowID`. |
| A-5 | The names `overlayShownToUser`, `parked` and the exact parked `zIndex` value. | Pattern 1 | Naming only. |

## Open Questions

1. **Does the pane bundle's Orca client migrate to a device key in the Theia document?**
   - Known: `web-runtime-session.ts` sets `allowKeyMigration: true`; a fork gets a new `deviceId`.
   - Unclear: P64 is not merged here, so the pane bundle's device was not observed.
   - Recommendation: the p66-02 lane reads both clients' device ids in the coordinator's live run (the attach lease's `pairedDeviceId` vs the pane client's) and takes A3 route (b) only if they differ.
2. **Should a parked agent page be active while a command runs?** Recommendation in O1: no until a live `wait` shows a stall.
3. **Frontend reload with orcad's recovery (P66-08).** Not run; the reconnect attaches with an empty inventory. The coordinator's live run should reload once and confirm `tab list` drops the old pages.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| PB binary (`objdir/dist/bin/powerbrowser`) | live rows | ✓ | built 2026-11-08 | — |
| Orca build (`orca/out/orcad`, `out/cli`) | live rows, bundle | ✓ | 1.4.248 | — |
| Orca Vite (`orca/node_modules/vite`) | bundle build | ✓ | 8.3.5 | — |
| `nix develop .#orca` / `.#theia` / `.#firefox` | builds | ✓ | — | — |
| PB Node (`.mozbuild/orca-probe-node`) | orcad | ✓ | 24.19.0 | — |
| Chromium | snapshot fixture generation | ✓ | 157.0.8103.38 | fixtures already generated and kept |
| `agent-browser` binary | fixture generation | ✓ | 0.39.4 (`orca/node_modules/agent-browser/bin/agent-browser-linux-x64`) | — |
| Live lock `/home/chris/coding/Power-Browser/.git/pb-live.lock` | live rows | ✓ | — | — |

Note: in this worktree `orca/src/main/orcad/orcad-browser-provider.ts` shows as modified (the applied 010 seam). `build-p66-thin-host.sh` therefore compares tracked state before and after the build instead of requiring a clean tree; the lane's `build-orca-browser-host.sh` should do the same.

## Validation Architecture

(`workflow.nyquist_validation` is `true`.) Everything below is automated. Nothing needs a human; the four human items stay in `66-CONTEXT.md` "Deferred Verification" for the end-of-milestone pass (D-18).

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Node 24 scripts registered in `scripts/verify-platform.sh` (no unit framework) |
| Config file | none (registry rows) |
| Quick run command | `scripts/verify-platform.sh --quick` or `--only <label>` |
| Full suite command | `scripts/verify-platform.sh` (live rows under `flock /home/chris/coding/Power-Browser/.git/pb-live.lock`) |

### Phase Requirements → Test Map
| Req / criterion | Behavior | Row(s) | Tier | Self-test plants (each red, naming it) | Needs |
|---|---|---|---|---|---|
| BRW-02 / SC1 | Entry points derived from the pin route to a PB web tab; no page-mounting component in PB's import graph; `browser` route targets the PB tab; each `createBrowserTab` caller reachable or listed dead | `orca-browser-entry-points` + `-self-test` | quick | new page-mounting component; screencast pane imported by the entry; `browser` route to a hosted pane; zero-member parse; **(A3)** placement override missing from the PB entry; a `createWebRuntimeSessionBrowserTab` caller left out of the derivation | `orca/` (SKIP when absent) |
| BRW-02 / SC1 | CLI `tab create` makes one PB web tab, in the background, within 1 s; one renderer `createBrowserTab` arrives as `createPage` with the device check (A3) | `orca-browser-agent-live` | live | (live row; pure helpers fed fixtures: tab current after create; two tabs for one page; device mismatch reported as `browser_host_lease_stale`) | built PB, Orca, Theia, bundle |
| BRW-03 / SC2 | The thin client bundle never reaches `web-runtime-client.ts`, never writes `WEB_RUNTIME_CLIENT_CAPABILITIES`, never names `subscribeOnCurrentConnection`, inlines no asset; tracked Orca state unchanged by the build | `orca-browser-host-bundle` + `-self-test` | full | each reach; a tracked edit; an inlined asset; **(A9)** `framing: 'v2'` with a token credential | Orca build |
| BRW-03 / SC2 | `goto`, `click`, `type`, `screenshot` on fixtures; planted pixel matches at DPR 1 **and DPR 2** (G2); a page the client did not create is refused; `webTabAgent` naming a user tab and a stock tab refused chrome-side; container clause (P66-26); decoy clause (P66-29); user close reported (A7: `tab list` drops the page) | `orca-browser-agent-live` | live | — | as above |
| BRW-03 / SC2 | Input to a parked agent tab moves no focus: chrome active element, user document focus, user active element unchanged, no `blur` in the user tab; chrome `elementFromPoint` at the agent target returns the user's tab (positive read of the same detectors first: the agent tab's own focus moved) | `orca-browser-agent-live` (focus clause) | live | pure comparison fed a recorded blur, a chrome focus change, a detector that never fires | as above |
| BRW-03 / SC2 | Three-way set equality: tier-1 automation methods, chrome `AGENT_METHODS`, dispatcher's served set; ability table rows ↔ derived abilities; no `BiDi` mechanism | `orca-browser-abilities` + `-self-test` | quick | non-tier-1 served method; missing tier-1 on each side; ability added at a re-pin; row marked BiDi; empty derivation; **(A4)** dialog rows marked other than `native` | tree, `orca/` |
| BRW-03 / SC2 | Wall: every agent method answers `not-agent-tab` / `unknown-tab` / `agent-stopped`; flag ignored on `already-open`; page table refuses duplicates and unmapped ids; **(A1)** parked placement only for agent entries and `overlayShownToUser` used at every former visibility read | `orca-browser-tab-scope` + `-self-test` | quick (stub boundary) | method arm without the wall; flag honoured on an existing tab; table accepting a duplicate; a user tab parked; a raw `style.visibility === "visible"` read added | tree |
| BRW-03 / SC2 | No listening socket beyond the sidecar and orcad ports | `no-remote-agent-port-live` + `-self-test` | live | `--remote-debugging-port=0` launch must go red naming the Remote Agent socket | built PB |
| BRW-03 | Boundary: `Cc[`/`Ci.` allowed in the child only on catalogued lines (A2) | `internals-boundary`, `internals-catalogue`, `ng-040-internals-catalogue-lines` (extended) | quick | uncatalogued `Cc[` in the child; `Services.` in the child | tree |
| BRW-03 | Snapshot structural fidelity vs agent-browser 0.39.4 fixtures; refs survive a delta; `click @eN` acts on the named node; fixture version equals the pin (A5) | `orca-browser-snapshot-live` | live (wave 2) | fixture version mismatch; a missing ref'd `(role, name)`; a ref renumbered after a delta; empty fixture set | built PB, fixtures |
| BRW-04 / SC3 | Mark and title class while the CLI drives; Stop ends control, next command fails with `browser_owner_unavailable` in the error message (Pitfall 8); stock window shows no mark after the mark was proven present | `orca-agent-mark-live` | live | pure helper fed: mark absent while driving; Stop not ending control; code in `error.code` instead of the message | built PB, Orca |
| BRW-04 | Two new kinds classified; `webTabAgentStop` only from the Stop handler | `gui02-web-tab-bridge` (extended) | quick | kind unclassified; Stop sent from a non-handler site | tree |
| BRW-05 / SC4 | U-01..U-30 set-equal to the PB tools map; each mapped contribution exists; deferrals name v2 ids | `orca-browser-tools` + `-self-test` | quick | added U-row; removed map entry; unregistered command id; unknown deferral id; zero-row parse | tree |
| copy | Mark/Stop copy has no internal identifier | `shell-error-copy-no-internals` | quick | (existing) | tree |

### Sampling Rate
- **Per task commit:** the lane's quick rows (`--only <label>` and `--only <label>-self-test`), plus `node scripts/scan-brand-residue.mjs` after staging.
- **Per wave merge:** `scripts/verify-platform.sh --quick`.
- **Phase gate:** `--quick` green; after the coordinator's rebuilds (Orca bundle, Theia audited install, `./mach build faster`), the live rows under the lock with `MOZ_PURGE_CACHES=1`: `orca-browser-agent-live`, `orca-agent-mark-live`, `no-remote-agent-port-live`, `orca-browser-snapshot-live` (wave 2), `orca-browser-host-bundle`; then `/gsd-verify-work`.

### Wave 0 Gaps
- [ ] `scripts/verify-orca-browser-{abilities,entry-points,tools,host-bundle,tab-scope}.mjs`, `scripts/verify-no-remote-agent-port-live.mjs`, `scripts/verify-orca-browser-agent-live.mjs`, `scripts/verify-orca-agent-mark-live.mjs`, `scripts/verify-orca-browser-snapshot-live.mjs` (all new), each with `--self-test`.
- [ ] A fixture generator for A5 (`scripts/gen-orca-snapshot-fixtures.mjs` or a lane-chosen name) and its fixtures; seed from `.planning/spikes/005-orca-browser-parity/p66-snapshot-reference/`.
- [ ] `check-internals-boundary.sh` self-test cases for `Cc[` and `Ci.` in the child (A2).
- [ ] The live rows grow from `p66-gate-probe.mjs` (`HOST_SETUP`, `dialogFacts`, `snapshotPixels`, the focus comparison) and `provider-proof.mjs`.

## Security Domain

(`security_enforcement` is not set: treated as enabled.)

### Applicable ASVS Categories
| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | yes | Orca's paired E2EE handshake, unchanged; offer read from the P64-07 file route, never a URL, env var or log |
| V3 Session Management | yes | One connection per client; lease bound to the connection id (orcad); a reload ends the session (P66-08) |
| V4 Access Control | yes | Two walls: page table (frontend) and agent flag + `AGENT_METHODS` (chrome); Stop state chrome-side |
| V5 Input Validation | yes | zod schemas from Orca for every event; chrome validates `params` per method; URL scheme wall of `webTabOpen`/`webTabNavigate` (http/https only) |
| V6 Cryptography | yes | Orca's primitives only; nothing hand-rolled |
| V8 Data Protection | yes | Agent container (P66-26); screenshots and snapshots only of agent tabs |

### Known Threat Patterns
| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Orca renderer code in the Theia document sends `webTabAgent` for a user tab | Elevation | Chrome wall (flag set only at creation; `already-open` ignores it) |
| Page script messages the agent actor | Tampering | Child has no `matches` and no DOM events; created only by chrome's `getActor` on an agent overlay |
| Agent reads the user's cookies or logins | Information disclosure | Separate `userContextId`; live clause proves the user's cookie is absent after proving the agent's own is present |
| Parked agent overlay intercepts real input | Spoofing | `z-index: -1` under the Theia frame; check reads chrome `elementFromPoint` |
| Dialog from an agent tab spoofs a system prompt over the IDE | Spoofing | Stock dialog names the page origin; owner item O2 |
| Remote Agent left enabled | Elevation | `no-remote-agent-port-live` |
| Pairing material in logs | Information disclosure | Redaction as in `scripts/lib/orca-run.mjs`; results files record only codes and booleans |

## Sources

### Primary (HIGH confidence)
- Live runs on this host, 2026-11-10, under the live lock: `.planning/spikes/005-orca-browser-parity/results-p66-gate-dpr1.json`, `results-p66-gate-dpr2.json`, produced by `p66-gate-probe.mjs` with `p66-probe-child.sys.mjs` and the bundle from `build-p66-thin-host.sh` / `p66-thin-host.ts` / `vite.p66.config.ts`.
- `agent-browser` 0.39.4 run against Chromium 157: `.planning/spikes/005-orca-browser-parity/p66-snapshot-reference/`.
- Orca 1.4.248 source (read this session): `src/main/runtime/rpc/methods/browser-client-host.ts`, `src/shared/browser-client-host-protocol.ts`, `browser-client-automation-protocol.ts:1-12`, `browser-runtime-capabilities.ts:1-35`, `paired-e2ee-client-handshake.ts`, `paired-runtime-connection.ts`, `src/main/orcad/orcad-client-page-commands.ts:1-130`, `src/main/runtime/browser/browser-client-page-opening.ts:47-185`, `browser-client-page-close.ts:18-41`, `src/main/runtime/browser-host/browser-host-client-page-creation.ts:38-53`, `src/main/runtime/device-key-fork.ts:20-79`, `src/main/runtime/rpc/mobile-e2ee-auth-validation.ts:90-133`, `src/main/runtime/runtime-browser-client-automation.ts`, `src/main/browser/browser-client-page-command-executor.ts`, `browser-client-page-automation-runtime.ts`, `agent-browser/agent-browser-bridge-core-commands.ts`, `agent-browser-bridge-page-commands.ts`, `agent-browser-snapshot-delta.ts`, `snapshot-engine.ts`, `snapshot-ax-tree-walk.ts`, `cdp-debugger-events.ts`, `browser-agent-activity.ts:1-25`, `src/renderer/src/web/preload-api/web-runtime-environments-api.ts:210-219`, `src/renderer/src/runtime/web-runtime-browser-creation.ts:40-120`, `src/renderer/src/store/slices/browser/browser-tab-actions.ts:30-90`, `package.json:233-236`.
- Gecko: `upstream/browser/actors/PromptParent.sys.mjs:150-330`, `upstream/browser/components/DesktopActorRegistry.sys.mjs:717-723`, `upstream/dom/webidl/Window.webidl:625-645`, `upstream/remote/shared/webdriver/Event.sys.mjs`, `upstream/remote/shared/listeners/ConsoleAPIListener.sys.mjs:12-78`, `upstream/testing/mochitest/tests/SimpleTest/EventUtils.js:2456-2474`.
- PB tree: `powerbrowser/shell/PowerBrowserAPI.sys.mjs` (`webTabOpen` :3568-3660, `webTabGeometry` :4150-4193, visibility reads, `registerGroupActor` :2262-2299, edit-state pair :9970-10000), `powerbrowser/shell/powerbrowser.js:55-160`, `scripts/check-internals-boundary.sh:30-130`, `theia/extensions/tab-uris/src/browser/web-tab.ts` (:653, :940-990, :1003-1050, :1715-1740), `.planning/probes/prompt-probe-verdict.json`, `.planning/v1.5-LIVE-PASS.md:108`.

### Secondary (MEDIUM confidence)
- `orca/node_modules/agent-browser/README.md` and `skill-data/core/references/{commands.md,snapshot-refs.md}` (the docs disagree on the output format; the run is authoritative).

### Tertiary (LOW confidence)
- None.

## Metadata

**Confidence breakdown:**
- Gate answers: HIGH - each ran live at DPR 1 and 2 (Q3) or once with orcad.
- Amendments: HIGH for A1, A2, A4, A5, A6-A9 (measured); MEDIUM for A3 (b) (source-derived; P64 not merged).
- Pitfalls: HIGH for 1-3, 5-8 (measured or source); MEDIUM for 4 (budget measured from source, fallback assumed).

**Research date:** 2026-11-10
**Valid until:** the next Orca re-pin or Gecko ESR re-pin (whichever comes first); 30 days otherwise.
