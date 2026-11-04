# Feature Landscape

**Domain:** Hosting Orca (stock web client + PB-spawned orcad) inside Power Browser, and replacing Orca's embedded Chromium browser with PB web tabs and PB chrome
**Milestone:** v1.7 Orca integration (workstream `orca`)
**Researched:** 2026-11-04
**Overall confidence:** HIGH for the inventory (read from source), MEDIUM for the Gecko mapping (Gecko side verified in the tree, PB-side feasibility is a guess), LOW for anything marked "unverified"

## How to read this file

- Orca source paths are relative to `/home/chris/coding/orca-eval` (HEAD 3052dd79, version 1.4.214). The installed build is 1.4.245; the two were not diffed. Line numbers are 1.4.214.
- Gecko source paths are relative to `/home/chris/coding/Power-Browser/upstream` (Firefox 153.5.1 ESR, the pin in `configuration.toml:155`). "In tree" means I read it there.
- "(guess)" marks a mapping that nobody has run. Codes used in the Gecko column:
  - **BiDi** = a WebDriver BiDi command that exists in the 153.5.1 tree (`remote/webdriver-bidi/modules/root/*.sys.mjs`).
  - **BiDi+** = BiDi plus a small script helper sent through `script.callFunction`/`script.evaluate`.
  - **ACT** = PB must add a JSWindowActor, chrome code or a `PowerBrowserAPI.sys.mjs` entry.
  - **NATIVE** = Gecko or PB chrome already does it with no automation protocol.
  - **NO** = not possible in Gecko 153, or not worth building.
- Who uses a capability: **agent** (an AI agent in an Orca terminal running `orca <cmd>`), **CLI** (same path, a person running it), **renderer** (Orca's React client over RPC), **main** (Orca's Electron main process, desktop only), **orcad** (the daemon itself).

---

# PART A. The Orca browser inventory

## A.0 What "an Orca browser tab" is, in three layers (read this first)

Three different seams exist. The spike has to choose one before the list below can be turned into a design.

| Seam | What it is | Where | What a Gecko implementation would have to do |
|------|-----------|-------|---------------------------------------------|
| S1 Provider seam | orcad asks a provider for a `RuntimeBrowserCommands` object with 83 members (`browserSnapshot` ... `browserDialogDismiss`). | `src/main/runtime/browser/browser-commands.ts:18-101`; factory type `src/main/runtime/runtime-browser-commands-factory.ts:13`; provider type `src/main/orcad/orcad-browser-provider.ts:14-20`; wiring `src/main/orcad/orcad-browser-startup.ts:25-56` | Implement all 83 members inside orcad's Node process. `OrcadBrowserProvider.kind` is the closed union `'electron' \| 'chromium'` (`orcad-browser-provider.ts:15`), so a Gecko provider needs an upstream Orca change. The seed prefers this route; the owner rule "never patch Orca" makes the upstream PR a dependency outside PB's control. |
| S2 Client-host lease seam | The paired client (today Orca desktop's Electron main) hosts the pages, and orcad sends it commands: `createPage`, `navigate`, `automation` (65 methods), `reclaimPage`, `closePage`, `restorePage`, `switchProfile`. | `src/shared/browser-client-host-protocol.ts:207-250`; automation method list `src/shared/browser-client-automation-protocol.ts:10-77`; RPC `browser.clientHost.attach` etc. in `src/main/runtime/rpc/methods/browser-client-host.ts`; desktop implementation `src/main/browser/client-hosts/leases/paired-runtime-browser-host-lease.ts` | PB code would play the client-host role over orcad's RPC, with no Orca change. Unverified: whether a client that is not Orca desktop (here a PB chrome-side service holding a device token) may attach, and what scope its token needs. The stock web client explicitly never hosts pages: `src/renderer/src/web/preload-api/web-browser-api.ts:26-27` ("A web client never hosts pages") and `src/renderer/src/components/browser-pane/browser-client-page-renderer-installation.ts:52-57` (returns null when `__ORCA_WEB_CLIENT__`). `orcad-browser-startup.ts:51` already sets `clientHostingWithoutEngine: true`, so orcad serves client-hosted pages even with no engine. |
| S3 CDP proxy seam | For the `orca exec` raw path and for most element actions, Orca runs the native `agent-browser` CLI (npm `agent-browser ~0.39.4`, `package.json:235`), which speaks CDP to a loopback WebSocket proxy that forwards to Electron's debugger. | `src/main/browser/cdp/transport/cdp-ws-proxy.ts:19-317`; discovery `cdp-target-discovery.ts:20-108` | Gecko removed CDP in Firefox 141; `remote/cdp` does not exist in the 153.5.1 tree. `agent-browser` documents only a CDP path (README: `--cdp`, `--auto-connect`, `--engine` for Lightpanda/Obscura; no Firefox or BiDi mention). A Gecko tab cannot be driven by the `agent-browser` binary. Under S1 or S2 PB must re-implement what that binary did, natively. |

Findings that change the plan:

1. **The stock web client has no working browser tab today.** In a paired runtime the web client renders a browser page as `RemoteBrowserPagePane` (a screencast of a page that orcad holds) or `ClientHostedBrowserPagePane` (`src/renderer/src/components/browser-pane/assemble-chrome/browser-workspace-pane.tsx:116-153`). Every other browser capability is stubbed off in the web client: devtools, grab mode, selection screenshots, hover extraction, cookie import, site permissions, extensions, popups, download events, context menu events, profiles (`web-browser-api.ts:20-120`). The remote pane's toolbar offers back, forward, reload, address bar and a draw tool only; the annotation button is disabled with the text "Browser annotations unavailable in remote runtime" (`stream-remote/remote-browser-page-toolbar.tsx:105-122`).
2. **A PB-spawned orcad has no browser provider unless one is added.** `resolveOrcadBrowserProvider` tries only (a) an installed Orca desktop executable, (b) `ORCA_BROWSER_EXECUTABLE` plus an `agent-browser` binary; otherwise it returns `unconfigured` or `driver_missing` (`orcad-browser-provider.ts:195-231`). INPUTS.md says Orca desktop is not installed, so by default the browser capability is reported unavailable (`browser_unavailable`, degradation capability `browser.headless.v1`, `src/shared/runtime-capability-degradation.ts:30-34`). v1.7 must therefore decide whether to hide Orca's browser entry points, not only whether to replace the engine.
3. **Orca already ships a reduced provider as precedent.** The external-Chromium provider throws `browser_profile_unavailable`, `browser_screencast_unavailable` and `browser_certificate_trust_unavailable` (`src/main/orcad/external-chromium-browser-process.ts:115-143`). Orca and its agents tolerate a provider that lacks profiles, screencast and certificate override. That supports a tiered Gecko provider (A.5).
4. **BiDi allows one session.** MDN/BCD records `session.new` `multiple_sessions=NO` for Firefox. PB's own live-test harness already owns a BiDi session with `--remote-debugging-port` (`scripts/lib/firefox-bidi.mjs:360-366`). A shipped PB agent bridge cannot share one session with another BiDi client. Also, a BiDi TCP port in a user's browser is a local attack surface; whether an in-process or pipe transport exists was not checked (unverified).
5. **BiDi already works against a PB web tab.** Spike 003 drove the Orca web client in a PB web tab with `browsingContext.captureScreenshot`, `script`-based DOM reads and `input.performActions` into the xterm (`.claude/skills/spike-findings-Power-Browser/references/orca-client-hosting.md:46-49`).

## A.1 Agent-facing: every `orca` browser command (80 specs)

Spec files: `src/cli/specs/browser-basic.ts` (BB, 40 specs) and `src/cli/specs/browser-advanced.ts` (BA, 40 specs). Line numbers are the `path:` line. Page targeting flags (`--page`, `--expect-url`) are added by `src/cli/specs/browser-page-target.ts:1-70` (`--page` on every command except those in `NOT_PAGE_TARGETED` at :4-14; `--expect-url` on the 34 mutating commands at :18-53). Each command maps 1:1 to an RPC `browser.*` method (`src/main/runtime/rpc/methods/browser-core.ts`, `browser-extras.ts`, `browser-text-rpc-methods.ts`, `browser-profile-rpc-methods.ts`, `browser-identity-rpc.ts`, `browser-screencast.ts`) and to a `RuntimeBrowserCommands` member (S1). 65 of them travel as `automation` methods in S2 (`browser-client-automation-protocol.ts:10-77`); tab, profile, identity, screencast and `open-url` do not.

Who uses: agent and CLI for all rows. The renderer also calls `goto`, `back`, `forward`, `reload`, `mouseMove/Down/Up/Wheel`, `tab*` and `screencast` from the remote pane (`stream-remote/use-remote-browser-page-navigation.ts:61`, `use-remote-browser-page-input.ts:162-218`, `remote-browser-page-session.ts:47,164,172`).

| ID | Group | Commands (spec line) | Orca engine path (source cite) | Gecko guess |
|----|-------|----------------------|--------------------------------|-------------|
| A1-01 | Navigation | `goto` (BB:88), `back` (BB:94), `reload` (BB:100), `forward` (BA:101) | CDP `Page.navigate`/`Page.reload`/`Page.navigateToHistoryEntry` with lifecycle waits (`cdp/commands/cdp-page-commands.ts:52,144,160`; `cdp-page-navigation-commands.ts:28-82`) | BiDi: `browsingContext.navigate`, `.reload` (has `ignoreCache`, `browsingContext.sys.mjs:1583`), `.traverseHistory`; load events `browsingContext.load/domContentLoaded` |
| A1-02 | Wait | `wait` (BB:112): `--selector --text --url --load --fn --state --timeout` | agent-browser `wait` (`agent-browser/agent-browser-wait-arguments.ts`); `networkidle` from CDP Network events (`cdp-navigation-operations.ts:117-123`) | BiDi+: poll through `script.callFunction`; `--load networkidle` derived from `network.*` events (guess) |
| A1-03 | Accessibility snapshot | `snapshot` (BB:27): `--interactive --compact --depth --selector --urls --delta --full` | CDP `Accessibility.enable/getFullAXTree` (`cdp/snapshots/snapshot-engine.ts:30-31,60-61`), cursor-interactive scan by `Runtime.evaluate` (`snapshot-cursor-interactive-elements.ts:13,59,87`), refs `@eN` bound to nodes via `DOM.requestNode/resolveNode/describeNode` (`cdp-ref-resolution.ts:54-86,174`), delta baseline per page (`agent-browser-snapshot-delta.ts`) | ACT (High). BiDi 153 has no accessibility tree command. `browsingContext.locateNodes` supports an `accessibility` locator (role/name) (`browsingContext.sys.mjs:120-126`) but returns nodes, not a tree. Build the tree in a content actor or from `remote/shared/webdriver/Accessibility.sys.mjs` machinery. This is the largest single piece. |
| A1-04 | Pixel capture | `screenshot` (BB:48: `--format --if-changed --annotate`), `full-screenshot` (BB:174), `pdf` (BB:168) | CDP `Page.captureScreenshot`, `Page.getLayoutMetrics`, `Page.printToPDF` through a paint-hold workaround (`cdp-screenshot.ts:182,217`; `cdp-page-commands.ts:98-122`; `cdp-print-to-pdf.ts`) | BiDi: `browsingContext.captureScreenshot` (origin viewport/document, clip, format), `browsingContext.print`. `--annotate` (numbered overlays) = BiDi+ plus image compose. `--if-changed` is Orca-side hashing. Screenshots "in CSS pixels so x/y match `orca mouse`" (BB:54) need a DPR check on PB's overlay (guess). |
| A1-05 | Pointer | `click` (BB:58), `dblclick` (BA:95), `hover` (BB:180), `drag` (BB:186), `mouse move/down/up/wheel` (BA:131,137,143,149), `scroll` (BB:82), `scrollintoview` (BA:107) | CDP `Input.dispatchMouseEvent` (`cdp/input/cdp-pointer-commands.ts:23-95`), node resolution and box model (`cdp-ref-resolution.ts:86`) | BiDi: `input.performActions` pointer and wheel sources. `scrollintoview` = BiDi+. Verified once: spike 003 typed into xterm via performActions. |
| A1-06 | Keyboard and text | `keypress` (BB:162), `type` (BB:70), `inserttext` (BA:125) | CDP `Input.dispatchKeyEvent`, `Input.insertText` (`cdp-text-input-commands.ts:24-146`; `guest-direct-key-input.ts:122-262`; US layout table `cdp-keyboard-us-layout.ts`) | BiDi: `input.performActions` key source. `inserttext` (no key events) = BiDi+ (guess; Gecko has no `Input.insertText` equivalent). |
| A1-07 | Form fields | `fill` (BB:64), `clear` (BB:150), `select-all` (BB:156), `select` (BB:76), `check` (BB:132), `uncheck` (BB:138), `focus` (BB:144) | `DOM.focus` + `Runtime.callFunctionOn` (`cdp-element-state-commands.ts:34-133`; `cdp-dom-focus-replay.ts`) | BiDi+: `script.callFunction` sets value and dispatches `input`/`change`; `focus` via script. |
| A1-08 | File upload | `upload` (BB:192): file input or a button that opens a picker, any frame | `Page.setInterceptFileChooserDialog` + `Page.fileChooserOpened` + `DOM.setFileInputFiles` (`cdp/input/guest-file-chooser.ts:33-60`; `agent-browser-bridge-interaction-commands.ts:106`) | BiDi: `input.setFiles`; picker case uses the `input.fileDialogOpened` event (in the 153 event list). |
| A1-09 | Page script | `eval` (BB:106), `exec` (BB:279: free-form agent-browser syntax, e.g. `read`, `get text @e3`, `is visible @e3`) | `Runtime.evaluate` (`agent-browser-bridge-capture-commands.ts:84`); `exec` is passed to the `agent-browser` binary (`agent-browser-bridge-state-commands.ts:265-271`) | `eval`: BiDi `script.evaluate`. `exec`: NO as a general promise (the vocabulary belongs to a CDP-only binary). Support a documented subset (`read` = page as Markdown, `get`, `is`) and return `browser_command_unavailable` otherwise, as Orca's own external provider does (`external-chromium-browser-process.ts:233-241`). |
| A1-10 | Element queries | `get` (BA:113: text/html/value/url/title/count/box), `is` (BA:119: visible/enabled/checked), `find` (BA:155: semantic locator + action), `highlight` (BA:262) | agent-browser commands behind `browserGet/Is/Find/Highlight` (`agent-browser-bridge-input-commands.ts:69-98`; `agent-browser-bridge-mouse-commands.ts:101`; `agent-browser-bridge-page-commands.ts:188`) | BiDi+ for get/is; `find` uses `locateNodes` accessibility/innerText locators (partial); `highlight` = ACT overlay. |
| A1-11 | Console and network capture | `capture start/stop` (BA:71,77), `console` (BA:83), `network` (BA:89) | CDP `Runtime.consoleAPICalled`, `Network.responseReceived/loadingFinished/loadingFailed` (`cdp-debugger-events.ts:51-119`) | BiDi events: `log.entryAdded`, `network.beforeRequestSent/responseStarted/responseCompleted/fetchError`. Response bodies: `network.addDataCollector/getData` (143, in tree). |
| A1-12 | Request interception | `intercept enable/disable/list` (BA:53,59,65) | CDP `Fetch.enable/disable/requestPaused` (`cdp-auxiliary-commands.ts:156-165`; `cdp-debugger-events.ts:126`) | BiDi: `network.addIntercept/removeIntercept/continueRequest/failRequest/provideResponse`. |
| A1-13 | Cookies | `cookie get/set/delete` (BA:7,13,31) | `Network.getCookies/setCookie/deleteCookies` (`cdp-auxiliary-commands.ts:61,99,120`) | BiDi: `storage.getCookies/setCookie/deleteCookies` (partition-aware). |
| A1-14 | Web storage | `storage local get/set/clear` (BA:218,224,230), `storage session get/set/clear` (BA:237,243,249) | agent-browser `storage` commands (`agent-browser-bridge-page-commands.ts:82-135`) | BiDi+ (`script.callFunction` on `localStorage`/`sessionStorage`). |
| A1-15 | Clipboard | `clipboard read/write` (BA:194,200) | agent-browser `clipboard` (`agent-browser-bridge-page-commands.ts:27-41`) | ACT/NATIVE (guess): clipboard permission and chrome clipboard API; not in BiDi. |
| A1-16 | Dialogs | `dialog accept/dismiss` (BA:206,212); error codes `browser_dialog_open/opened` | `Page.javascriptDialogOpening`, `Page.handleJavaScriptDialog` (`cdp-debugger-events.ts:17-20`); `browser-javascript-dialogs.ts` | BiDi: `browsingContext.handleUserPrompt`, events `userPromptOpened/Closed`. PB web-tab overlays: BiDi `handleUserPrompt` goes through `TabManager.getTabForBrowsingContext` which returns null for overlays (finding recorded in `.planning/spikes/002c-ext-route-chrome-tab-model/README.md`, row for `remote/shared/TabManager.sys.mjs:169-177`) - re-test on a web tab. |
| A1-17 | Download | `download` (BA:256: click a selector, save to path) | `agent-browser-bridge-page-commands.ts:138-186`; `browser-manager-download-*.ts` | BiDi: events `browsingContext.downloadWillBegin/downloadEnd` (144/145, in tree) plus `browser.setDownloadBehavior` (149). Click via A1-05. |
| A1-18 | Viewport and device | `viewport` (BA:39: width/height/scale/`--mobile`), `set device` (BA:162) | `Emulation.setDeviceMetricsOverride/setVisibleSize/setTouchEmulationEnabled` (`agent-browser-bridge-state-commands.ts:108-120`; `browser-manager-viewport.ts:245-259`) | BiDi: `browsingContext.setViewport` (has `devicePixelRatio`). Touch emulation: `emulation.setTouchOverride` is NOT in 153. Mobile mode is partial (guess). On a chrome-owned overlay the viewport override may fight PB layout (unverified). |
| A1-19 | Emulation and network state | `geolocation` (BA:46), `set offline` (BA:168), `set headers` (BA:174), `set credentials` (BA:180), `set media` (BA:186) | `Emulation.setGeolocationOverride` (`cdp-auxiliary-commands.ts:149`); the rest via agent-browser | BiDi: `emulation.setGeolocationOverride`, `emulation.setNetworkConditions` (offline), `network.setExtraHeaders`, `network.continueWithAuth`. `set media` (color-scheme, reduced motion): `emulation.setMediaFeaturesOverride` is Firefox 159, absent in 153.5.1 (not in tree list). Guess ACT. |
| A1-20 | Tab management | `tab list/show/current/switch/create/close` (BB:198-272), `--split <right\|left\|down\|up>` (BB:222), popups listed as `popup-<n>` with `openerBrowserPageId` | `RuntimeBrowserTabQueries/Creation/Close` (`src/main/runtime/browser/browser-tab-*.ts`); renderer tab/pane creation (`browser-tab-renderer-create.ts`) | PB-owned table `browserPageId <-> web tab widget` plus BiDi `browsingContext.create/close/activate/getTree`. The PB web tab address is the page URL, so two tabs on one URL share an address (`docs/URI-SCHEMES.md`, "`http:` / `https:`"); the id mapping cannot live in the URI. `--split` maps to a Theia split command (guess). |
| A1-21 | Tab profiles | `tab profile list/create/delete/set/show/use-default/clone` (BB:229-266) | `RuntimeBrowserProfiles` (`browser-profiles.ts`); partitions `src/main/browser/routing/partitions/*` | BiDi `browser.createUserContext/getUserContexts/removeUserContext` (124) is the nearest primitive. Orca's own external-Chromium provider drops this group (`external-chromium-browser-process.ts:115-125`). Defer (A.5 tier 3). |
| A1-22 | Identity | `browser identity get/set --mode clean\|native` (BB:8,15) | UA identity collectors (`src/main/browser/identity/*`), `Emulation.setUserAgentOverride` (`browser-manager-navigation.ts:162`) | BiDi `emulation.setUserAgentOverride` (145, in tree). Low. |
| A1-23 | Open URL on client | `open-url` (BB:21) -> `browser.openUrl` | `browser-core.ts:136`; `RuntimeBrowserTabCreation.browserOpenUrlOnClient` | PB: open a web tab (existing `WebTabOpenHandler.openUrl`). Low. |
| A1-24 | Certificates | RPC only `browser.certificate.proceed` (`browser-core.ts:60`) | `src/main/browser/certificate-trust/*` | NATIVE (Gecko cert error page override) or BiDi `browser.createUserContext acceptInsecureCerts` (140). |
| A1-25 | Remote screencast | RPC only `browser.screencast`, `browser.screencast.unsubscribe` (`rpc/methods/browser-screencast.ts:10`) | CDP `Page.startScreencast/screencastFrame/screencastFrameAck` (`cdp/screencast/browser-screencast-stream.ts:148,236`; `browser-screencast-cdp-events.ts:42-94`) | NO and not needed. Used only by the stock remote pane that PB replaces. BiDi `browsingContext.startScreencast` is Firefox 154. |
| A1-26 | Cookie import and clear | RPC only `browser.profileDetectBrowsers/ImportFromBrowser/ClearGoogleCookies/ClearDefaultCookies` | `src/main/browser/cookies/**` (reads Chromium, Firefox, Safari cookie stores) | NO. Anti-feature (A.6). |

Count check: 80 CLI specs are covered by A1-01..A1-23 (every spec line in BB and BA appears above). Rows A1-24..A1-26 are RPC-only.

## A.2 Every CDP method Orca's own source calls (83 names)

Found by a static string scan of `src/main`, `src/shared`, `src/cli`, `src/renderer` (test and fixture files excluded). Count by domain: Page 22, Network 12, Target 11, Runtime 8, Emulation 8, DOM 7, Input 7, Fetch 3, Accessibility 2, IO 2, Browser 1. Dynamically built method names would be missed. First-use cite is `path:line` under `src/main/browser/`.

| Domain | Methods (first use) | Used for | Gecko guess |
|--------|--------------------|----------|-------------|
| Page | enable (`cdp/commands/cdp-debugger-channel.ts:69`), navigate (`cdp-page-commands.ts:52`), reload (:160), navigateToHistoryEntry (:144), getNavigationHistory (`cdp-navigation-operations.ts:7`), setLifecycleEventsEnabled (`cdp-page-navigation-commands.ts:82`), captureScreenshot (`cdp-page-commands.ts:122`), printToPDF (:98), getLayoutMetrics (:112), startScreencast (`screencast/browser-screencast-stream.ts:148`), stopScreencast (:236), screencastFrame (`browser-screencast-cdp-events.ts:42`), screencastFrameAck (:94), javascriptDialogOpening (`cdp-debugger-events.ts:17`), handleJavaScriptDialog (:20), javascriptDialogClosed (`browser-screencast-cdp-events.ts:55`), fileChooserOpened and setInterceptFileChooserDialog (`input/guest-file-chooser.ts:33,44`), frameNavigated (`cdp-debugger-events.ts:12`), loadEventFired (`browser-screencast-cdp-events.ts:73`), createIsolatedWorld (`input/guest-focused-frame-route.ts:78`), bringToFront (`cdp/transport/cdp-ws-proxy.ts:235`, answered locally as a no-op so the agent never steals user focus) | navigation, capture, dialogs, file chooser, frame tracking | BiDi `browsingContext.*`, `input.fileDialogOpened`. Screencast: NO (not needed). `createIsolatedWorld`: BiDi `script` sandbox parameter. |
| Runtime | evaluate (`agent-browser/agent-browser-bridge-capture-commands.ts:84`), callFunctionOn (`agent-browser-bridge-interaction-commands.ts:94`), enable (`cdp-auxiliary-commands.ts:180`), consoleAPICalled (`cdp-debugger-events.ts:51`), exceptionThrown (`identity/browser-session-ua-cdp-collector.ts:185`), releaseObjectGroup (`input/guest-focused-frame-route.ts:65`), runIfWaitingForDebugger (ua collector), terminateExecution (`agent-browser-bridge-capture-commands.ts:89`) | eval, element helpers, console | BiDi `script.evaluate/callFunction/disown`, `log.entryAdded`. `terminateExecution` has no BiDi form (timeout and cancel the command instead). |
| DOM | enable (`cdp-debugger-lifecycle.ts:55`), describeNode (`cdp-ref-resolution.ts:54`), requestNode (:72), resolveNode (:73), getBoxModel (:86), focus (`input/cdp-text-input-commands.ts:22`), setFileInputFiles (`agent-browser-bridge-interaction-commands.ts:106`) | node refs, geometry, focus | BiDi shared references (`sharedId`) from `script`/`locateNodes`; box via `getBoundingClientRect` in script (BiDi+). |
| Accessibility | enable, getFullAXTree (`snapshot-engine.ts:30-31`) | the `snapshot` tree | ACT (see A1-03). |
| Input | dispatchMouseEvent (`agent-browser-bridge-pointer-commands.ts:64`), dispatchKeyEvent (`input/cdp-text-input-commands.ts:24`), insertText (`cdp-page-input-commands.ts:76`), dispatchTouchEvent, emulateTouchFromMouseEvent, synthesizeTapGesture, imeSetComposition (all `input/agent-input-focus-guard.ts:77-91`) | pointer, keys, text, touch and IME used to keep the agent from stealing user focus | BiDi `input.performActions` covers mouse/key/wheel. Touch tap and IME composition: partial or NO (guess). |
| Network | enable, getCookies (`cdp-auxiliary-commands.ts:61`), getAllCookies (`cookies/browser-cookie-clear-store.ts:174`), setCookie (:99), deleteCookies (:120), requestWillBeSent, responseReceived, loadingFinished, loadingFailed (`cdp-debugger-events.ts:74-119`), requestWillBeSentExtraInfo, webSocketCreated, webSocketWillSendHandshakeRequest (`identity/browser-session-ua-cdp-collector.ts:205-219`) | cookies, capture log, idle detection, UA probing | BiDi `storage.*`, `network.*` events. WebSocket handshake events: NO (only the UA-identity collector uses them; not needed in PB). |
| Fetch | enable, disable (`cdp-auxiliary-commands.ts:156,165`), requestPaused (`cdp-debugger-events.ts:126`) | interception | BiDi `network.addIntercept` family. |
| Emulation | setDeviceMetricsOverride (`agent-browser-bridge-state-commands.ts:108`), clearDeviceMetricsOverride, setVisibleSize, setTouchEmulationEnabled (`agent-browser-bridge-mouse-commands.ts:134`), setGeolocationOverride (`cdp-auxiliary-commands.ts:149`), setUserAgentOverride (`guest-lifecycle/manager/browser-manager-navigation.ts:162`), setEmulatedMedia (`site-settings/browser-site-display-controller.ts:185`), setFocusEmulationEnabled (`input/agent-input-focus-guard.ts:98`) | viewport, device, geolocation, UA, per-site dark mode, "page is focused" while the user works elsewhere | BiDi `browsingContext.setViewport`, `emulation.setGeolocationOverride`, `emulation.setUserAgentOverride`. `setEmulatedMedia`, touch and focus emulation: NO in 153 (guess ACT with Gecko prefs / chrome). |
| Target | getTargets, getTargetInfo, setDiscoverTargets, attachToTarget, attachToBrowserTarget, detachFromTarget, setAutoAttach, activateTarget, attachedToTarget, detachedFromTarget, targetCreated (`cdp/transport/cdp-target-discovery.ts:53-74`; `cdp-debugger-lifecycle.ts:59`) | the proxy presents one fake page target to agent-browser | Not needed: BiDi `browsingContext.getTree` and context events replace the whole domain. |
| IO | read, close (`cdp-ws-proxy.ts:268,277`) | streamed PDF bytes | Not needed (`browsingContext.print` returns base64). |
| Browser | getVersion (`cdp-target-discovery.ts:79`) | proxy pretends to be Chrome | Not needed. |

### A.2.1 CDP names present in the `agent-browser` binary (presence only)

String scan of `resources/agent-browser-linux-x64` in the installed 1.4.245 build (Rust, strings concatenate, so this proves presence, not use). Present beyond A.2: Page.addScriptToEvaluateOnNewDocument, Page.getFrameTree, Network.setExtraHTTPHeaders, Network.setCookies, Network.clearBrowserCookies, Network.emulateNetworkConditions, Network.getResponseBody, Fetch.continueRequest/fulfillRequest/failRequest/continueWithAuth, Emulation.setTimezoneOverride/setLocaleOverride, DOM.getDocument/querySelector/scrollIntoViewIfNeeded, Runtime.addBinding, Target.createTarget/closeTarget/createBrowserContext, Browser.close/setDownloadBehavior/grantPermissions, Tracing.start, Security.setIgnoreCertificateErrors. Everything here has a BiDi counterpart in 153 except `Tracing`, `Runtime.addBinding` (BiDi uses `script` channels/preload scripts) and `Browser.grantPermissions` (BiDi `permissions.setPermission` is in tree). The binary's command list (`open`, `snapshot`, `get`, `is`, `find`, `wait`, `cookies`, `storage`, `network`, `set`, `clipboard`, `tab`, `frame`, `dialog`, `console`, `errors`, `inspect`, `trace`, `profiler`, `vitals`, `react`, `a11y`, `diff`, `record`, `state`, `auth`, `profiles`, ...) is what `orca exec` exposes; Orca documents only a subset in `skill-guides/orca-cli/references/browser.md`.

## A.3 User-facing browser tools (renderer and main)

Source root for rows: `src/renderer/src/components/browser-pane/` (BP) and `src/main/browser/` (MB). "Stock web" = what the unmodified web client does today (stubs cited in A.0). "PB today" = what the existing PB chrome bar and web tab give, from `REQUIREMENTS.md` (v1.5 list; its checkboxes may be out of date, so treat as unverified).

| ID | Tool | Behaviour and source | Who | Stock web | Gecko / PB guess |
|----|------|----------------------|-----|-----------|------------------|
| U-01 | Address bar | Omnibox with inline completion, suggestions from history, tabs, workspace docs, switch-to-tab, edit session, Escape/dismiss rules: `BP/assemble-chrome/BrowserAddressBar.tsx`, `browser-address-bar-suggestions.ts`, `use-browser-address-bar-*.ts`; focus key `browser.focusAddressBar` Mod+L (`src/shared/keybindings/definitions-core-3.ts:22`) | user | present (remote pane) | NATIVE: PB chrome bar replaces it (Chris's direction). Orca-specific suggestions (previewed workspace docs, `onOpenWorkspaceDoc`) have no PB source: skip. |
| U-02 | Navigation row | back/forward/reload, hard reload Mod+Shift+R, load progress bar, load-failure overlay with auto-retry: `BP/assemble-chrome/browser-navigation-control-row.tsx`, `browser-load-progress.tsx`, `BP/navigate/browser-load-failure-overlay.tsx`, `browser-load-failure-auto-retry.tsx` | user | partial | NATIVE (existing). |
| U-03 | Find in page | `BP/assemble-chrome/BrowserFind.tsx`; `browser.find` Mod+F (`definitions-core-2.ts:262`); guest frame traversal | user | no | NATIVE: REQUIREMENTS PAGE-01 marked done. |
| U-04 | Zoom and default zoom | `BP/host-guest/browser-page-zoom.ts`, `browser-guest-wheel-zoom` (`MB/guest-lifecycle/input/browser-guest-wheel-zoom.ts`), setting `settings/browser/BrowserDefaultZoomSetting.tsx` | user | no | NATIVE: PAGE-02 done. |
| U-05 | DevTools dock | Docked devtools panel beside the page: `BP/devtools-dock/BrowserDevToolsDock.tsx`, `MB/guest-lifecycle/browser-guest-devtools-dock.ts:1-271`; IPC `openDevTools` (`src/preload/api/browser/browser-bridge-guest-registration-and-downloads.ts:81`) | user | stubbed `false` (`web-browser-api.ts:22`) | ACT, High (guess): Gecko devtools exists in the build, but attaching a toolbox to a chrome-owned overlay `<browser>` and docking it in a Theia tab is unproven. Candidate for deferral. |
| U-06 | Grab page element | "Copy" intent: pick an element, get a payload `{page, target, nearbyText, ancestorPath, screenshot}` (`src/shared/browser-grab-types.ts:81-87`), secrets and query strings stripped (`MB/element-grab/browser-grab-payload.ts:1-60`); injected guest scripts `MB/element-grab/grab-guest-*.ts` (overlay, selection, element context, React component info); shortcut `browser.grabElement` Mod+C in browser scope (`definitions-core-3.ts:30`) | user | stubbed unavailable (`web-browser-api.ts:44-60`) | ACT, Medium: the scripts are plain DOM code, so a JSWindowActor can run them. The PB-chrome toolbar button and result sheet (`BP/annotate/GrabConfirmationSheet.tsx`) are new PB UI. |
| U-07 | Annotate element and send to agent | Pick an element, write a comment, tray of pending annotations, send to an agent terminal or copy: `BP/annotate/browser-page-annotation-tray.tsx`, `BrowserAnnotationSendMenuContent.tsx`, `use-browser-page-annotation-send.ts`; shortcut `browser.annotateElement` (`definitions-core-3.ts:38`) | user | disabled in remote pane (`remote-browser-page-toolbar.tsx:105-122`) | ACT + Orca RPC (`terminal.send`, `src/main/runtime/rpc/methods/terminal*.ts`). Medium-High. Differentiator. |
| U-08 | Markup (draw on screenshot) | Tools pen, highlight, arrow, rect, ellipse, text (`BP/annotate/markup-drawing-model.ts:3`); composes the screenshot and copies/sends it: `MarkupOverlay.tsx`, `markup-screenshot-compose.ts`, `markup-clipboard-delivery.ts` | user | present (`remote-browser-page-toolbar.tsx:125-132`) | Needs BiDi `captureScreenshot` plus a PB widget. Medium. |
| U-09 | Agent activity mark and cursor | Tab marked while an agent command is queued/running, idle 20 s (`MB/guest-lifecycle/browser-agent-activity.ts:15`); animated cursor glyph (`BP/agent-cursor/*`, 8 files); cursor arrival timeout 1.5 s (:16) | user sees, agent causes | no | PB chrome overlay on the web tab. Medium. Needed once an agent can drive a PB tab (trust and visibility). |
| U-10 | Agent input focus guard | Agent input must not take keyboard focus from the user: `MB/cdp/input/agent-input-focus-guard.ts` (focus emulation, IME, touch), `MB/routing/input-ownership/remote-cli-page-admission.ts`, proxy answers `Page.bringToFront` as a no-op (`cdp-ws-proxy.ts:235`) | agent | n/a | High risk (unverified): BiDi `performActions` targets a browsing context and may require the page to be focused. Needs a spike item. |
| U-11 | History dialog | Search, remove, clear by range: `BP/history/BrowserHistoryDialog.tsx`; `browser.showHistory` | user | present | NATIVE: PB has history (PROJECT.md). |
| U-12 | New-tab page | Tiles, detected local dev servers, linked workspace cards: `BP/new-tab/BrowserNewTabPage.tsx`, `use-browser-new-tab-servers.ts` | user | present | Optional. The "local dev servers of this worktree" tile is a useful differentiator for agent work. |
| U-13 | Downloads | Destination choice, progress, cancel, list: `MB/guest-lifecycle/manager/browser-manager-download-*.ts`, `MB/downloads/browser-download-destination.ts`, `BP/navigate/browser-page-download-list.tsx`; IPC download-requested/progress/finished (`browser-bridge-guest-registration-and-downloads.ts:221-267`) | user | event stubs only | NATIVE (Gecko downloads). REQUIREMENTS PAGE-06 is unchecked: confirm state. |
| U-14 | Popups | Pages that `window.open` become tabs, listed as `popup-<n>`, with opener link: `MB/guest-lifecycle/popups/*` (19 files), IPC `popup` (`...downloads.ts:193`) | user, agent | stub | NATIVE + PB web-tab policy. Agents need the popup listed (`skill-guides/orca-cli/references/browser.md`, popup rule). |
| U-15 | Page prompts | JS dialogs, HTTP auth, permission prompts, external-app prompts: `BP/browser-javascript-dialog-prompt.ts`, `browser-http-auth-prompt.ts`, `browser-site-permission-prompt.ts`, `browser-external-app-prompt.ts`; main `MB/guest-lifecycle/prompts/*` | user | no | NATIVE (REQUIREMENTS PROMPT-*). Agent side: A1-16. |
| U-16 | Certificate errors | Interstitial with proceed: `MB/certificate-trust/*` | user, agent | stub | NATIVE. |
| U-17 | Site settings | Per-site permissions, color scheme override (`Emulation.setEmulatedMedia`), audio mute, zoom: `MB/site-settings/*`; IPC sitePermissions, setPageSiteColorScheme, setPageAudioMuted (`browser-bridge-page-interaction-and-sessions.ts:204-210`; `...downloads.ts:119-121`) | user | stub | NATIVE (SITE-04/05/06 unchecked in REQUIREMENTS: confirm). |
| U-18 | Page context menu | Back, Forward, Reload, Cut, Copy, Paste, Undo, Redo, Select All, Copy Link Address, Open Link In Orca Browser, Open Link In Default Browser, Save Image, Copy Image, Copy Image Address, Inspect, Appearance, Zoom, Copy Page URL: `BP/assemble-chrome/browser-page-context-menu-items.tsx:191-269`, remote variant `BP/stream-remote/remote-browser-page-context-menu.tsx:192-277` | user | event stub | NATIVE (Gecko context menu). |
| U-19 | Profiles and session partitions | Profile switcher, scope isolated/imported, "New Profile": `BP/assemble-chrome/browser-toolbar-profile-dialogs.tsx`, `settings/browser/profiles/*`, `MB/routing/partitions/*` | user | stub | NO for v1.7 (see A1-21). One PB profile. |
| U-20 | Cookie import from other browsers | Chrome, Edge, Safari, Firefox cookie sources: `MB/cookies/sources/*`, `BrowserImportHintButton.tsx` | user | stub "Cookie import is unavailable in the web client" (`web-browser-api.ts:86-96`) | NO. PB is Firefox; Firefox's own import covers it. Anti-feature. |
| U-21 | WebExtensions host | Toolbar, popups, Chrome Web Store install, 200+ files `MB/browser/extensions/**`, `BP/assemble-chrome/browser-extension-toolbar.tsx` | user | stub "run only in the Orca desktop app" (`web-browser-api.ts:5-12,116-148`) | NO. PB has its own extension track (REQUIREMENTS EXT-05..10). Anti-feature. |
| U-22 | UA identity setting | clean or native: `settings/browser/BrowserUserAgentSetting.tsx`, `MB/identity/*` | user | n/a | Low; see A1-22. |
| U-23 | Link routing | Which links open in the Orca browser vs the system browser; modifier key; background open; terminal link actions: `settings/browser/routing/BrowserLinkRoutingSetting.tsx`, `BrowserTerminalLinkActionsSetting.tsx`, `BrowserLinkRoutingModifierSetting.tsx` | user | `onOpenLinkInOrcaTab` stub (`web-browser-api.ts:41`) | Unverified: what the web client does when a user clicks an `http` link in an Orca terminal or chat. This decides whether Orca-originated links open as PB web tabs. Table stake to verify in the spike. |
| U-24 | SSH routing and network tunnels | `MB/browser/network/**` (about 40 files), `ssh-routed-browser-page-gate.tsx` | user | stub | NO. Anti-feature. |
| U-25 | Egress indicator | `BP/assemble-chrome/browser-egress-indicator.tsx` | user | present | NO. PB has its own egress allowlist (CLAUDE.md and the survey). |
| U-26 | Document preview | Local HTML/Markdown rendered in a browser page through a grant-based protocol: `MB/document-preview/*` (7 files), `BP/workspace-doc/*` | user | partial | Low; later. |
| U-27 | View source, open in default browser | Toolbar buttons: `BP/assemble-chrome/browser-chrome-toolbar.tsx:109-110,244-248` | user | no | NATIVE (`view-source:` URL; PB `open-browser-window` command). |
| U-28 | Mobile driver overlay | "A phone is driving this page": `BP/assemble-chrome/BrowserMobileDriverOverlay.tsx` | user | n/a | NO. Orca mobile only. |
| U-29 | Remote screencast pane | The stock browser in the web client: `BP/stream-remote/*` (28 files) | user | the default | Hide or suppress: replaced by PB tabs. |
| U-30 | Keyboard shortcuts, browser scope | 9 ids: `browser.find`, `.back`, `.forward`, `.reload`, `.hardReload`, `.focusAddressBar`, `.showHistory`, `.grabElement`, `.annotateElement` (`src/shared/keybindings/definitions-core-2.ts:262-294`, `definitions-core-3.ts:6-38`) | user | partial | Map to PB chrome keybindings; only grab and annotate are new. |

## A.4 What Gecko 153.5.1 provides (verified in the tree)

- No CDP: `remote/cdp` does not exist; `remote/` contains `components marionette server shared test webdriver-bidi`.
- BiDi commands implemented, `remote/webdriver-bidi/modules/root/*.sys.mjs`:
  - browser: close, getClientWindows, createUserContext, getUserContexts, setDownloadBehavior, removeUserContext, setClientWindowState
  - browsingContext: activate, captureScreenshot, close, create, getTree, handleUserPrompt, locateNodes, navigate, print, reload, setViewport, traverseHistory
  - emulation: setGeolocationOverride, setLocaleOverride, setNetworkConditions, setScreenOrientationOverride, setScreenSettingsOverride, setTimezoneOverride, setUserAgentOverride
  - input: performActions, releaseActions, setFiles
  - network: addDataCollector, addIntercept, continueRequest, continueResponse, continueWithAuth, disownData, getData, failRequest, provideResponse, removeDataCollector, removeIntercept, setCacheBehavior, setExtraHeaders
  - permissions: setPermission; script: addPreloadScript, callFunction, disown, evaluate, getRealms, removePreloadScript; session: new, end, status, subscribe, unsubscribe; storage: deleteCookies, getCookies, setCookie; webExtension: install, uninstall
- Events: `browsingContext.*` (contextCreated/Destroyed, load, domContentLoaded, navigationStarted/Committed/Failed, fragmentNavigated, historyUpdated, downloadWillBegin/End, userPromptOpened/Closed), `network.*` (authRequired, beforeRequestSent, responseStarted, responseCompleted, fetchError), `log.entryAdded`, `script.message/realmCreated/realmDestroyed`, `input.fileDialogOpened`.
- Not in 153 (MDN BCD Firefox versions): `browsingContext.startScreencast/stopScreencast` 154, `emulation.setMediaFeaturesOverride` 159, `captureScreenshot imageSize` 158, `emulation.setTouchOverride`, `setScriptingEnabled`, `setViewportMetaOverride`, `setScrollbarTypeOverride` not implemented. ESR 153 will not receive these unless backported (unverified).
- No accessibility-tree command. Marionette (`remote/marionette/driver.sys.mjs:4420-4500`) adds `WebDriver:GetComputedRole/GetComputedLabel`, `TakeScreenshot`, `Print`, `WebAuthn:*`, `Permissions:SetPermission`; per-element, not a tree.
- `--remote-allow-system-access` exposes chrome contexts to BiDi (`remote/components/RemoteAgent.sys.mjs:37-99`); PB's harness already uses it (`scripts/lib/firefox-bidi.mjs:366`).

## A.5 Suggested tiers for the Gecko-side build (guess, for the spike to confirm)

- **Tier 1, agents can work in PB tabs:** A1-01, 02, 03 (snapshot), 04 (screenshot), 05, 06, 07, 09 (`eval`, `exec read`), 11, 13, 16, 20, 23. This is the set the Orca skill teaches first (`skill-guides/orca-cli/references/browser.md`, "Common commands").
- **Tier 2:** A1-08, 10, 12, 14, 15, 17, 18, 19, 22, 24, U-06..U-09.
- **Tier 3 (not planned):** A1-21, A1-25, A1-26, U-05, U-19..U-21, U-24, U-25, U-28, and the S3 `exec` free-form vocabulary.

---

# PART B. What an "Orca tab" is

## B.1 Orca's views and where they live

Orca's tab model has 8 content types: `terminal`, `editor`, `diff`, `conflict-review`, `check-details`, `agent-session`, `browser`, `simulator` (`src/shared/tab-types.ts:18-26`); the visible kinds collapse to terminal, editor, agent-session, browser, simulator (:28-34). A terminal tab has `viewMode: 'terminal' | 'chat'` (:70). Tabs live in groups; groups form a split tree `TabGroupLayoutNode` (:6-14), per worktree. In shipped builds the renderer owns layout (`ORCA_LAYOUT_OWNER_IS_MAIN` is off, `src/shared/layout-owner-switch.ts:1-9`), but orcad publishes a mirrored session-tabs inventory: RPC `session.tabs.list/subscribe/activate/move/close/updatePaneLayout` (`src/main/runtime/rpc/methods`), snapshot type `RuntimeMobileSessionTabsSnapshot` with `tabGroups`, `tabGroupLayout` and `tabs` (`src/shared/runtime-session-contracts.ts:251-264`). The web client's one entry is `src/renderer/web-index.html` (`vite.web.config.ts:35`); no URL router exists and the only location parsing is the pairing fragment (`src/renderer/src/web/web-pairing.ts:49-97`). The Expo mobile app has a web build with real routes (`mobile/app/h/[hostId]/session/[worktreeId].web.tsx`) but it is shipped to phones through an RPC chunk transfer (`src/main/runtime/rpc/methods/mobile-web-bundle.ts`), expects a native bridge (`mobile/src/mobile-web-shell/bridge-host-*.ts`) and `orcad` rejects a web root without `web-index.html` (`orcad-command-arguments.ts:109-122`). Treat it as unusable for v1.7 (unverified that it runs without the bridge).

| Orca view | Where it renders | Needs from orcad | Own PB tab possible? | Notes |
|-----------|------------------|------------------|----------------------|-------|
| Whole client | `web-index.html` in one PB web tab | pairing, WS RPC | Yes, trivially | This is spike 003's proven shape. |
| Browser page | Today a screencast pane inside the client (A.0) | `browser.*` RPC | **Yes, by design** | Chris's direction makes each Orca browser page a PB web tab. Natural boundary. |
| Terminal / agent TUI | xterm pane inside the client | `terminal.*` RPC (create, subscribe, send, resize, ...) | Possible later, not without new PB code | A Theia `@theia/terminal` widget could attach to an orcad PTY over `terminal.subscribe`/`send` (unverified: wire format, e2ee, agent-status hooks, resize ownership with the client). Orca ties agent status, scrollback and "agent hooks" to its own pane. |
| Chat (agent-session, native chat) | React pane in the client | `nativeChat.*`, `agent` RPC | No | No PB equivalent. The 12 `@theia/ai-*` packages have no adapter for Orca's chat. |
| Editor / diff / conflict / checks | Monaco panes in the client | `files.*` RPC (read, write, watch, search) | Possible later (Theia editor on an orcad-backed filesystem provider) | Large; duplicates Theia's editor. Unverified. |
| Worktree/project sidebar, Add project, tasks, settings, automations | Fixed layout of the client shell | `repo.*`, `worktree.*` | No (they are not tabs in Orca either) | Lives inside the client tab. |
| Simulator/emulator | Pane in the client | emulator bridge | No (and unavailable on web: `web-browser-api.ts:152-160`) | Hide. |

Splitting inside the client uses react, @dnd-kit and Orca's own `tab-group` code (INPUTS.md). Orca panes cannot be dragged into Lumino, and PB tabs cannot be dragged into Orca's splits. That is a given of hosting the stock client; no PB feature changes it.

## B.2 Recommended definition (opinionated)

1. **An "Orca tab" in v1.7 is the whole Orca client in one PB tab**, address `pb-orca:`. This is the only unit that works with the stock client, and it already moves between Theia modes like any main-area widget. The URI must follow `docs/URI-SCHEMES.md` rules: no query, no fragment, no encoded payload, no non-user-chosen discriminators (general rules, lines 16-40). So the pairing offer and the loopback port never appear in the address; they stay in the widget's construction options. An empty path names the singleton client. Whether two client tabs on one orcad can coexist (two renderers mirroring one session list) is unverified; default to a singleton.
2. **Orca browser pages are separate PB web tabs** (their address is the page URL), tied to an Orca `browserPageId` through a PB-side table that is not part of the URI. They are the one Orca view that becomes its own PB tab in v1.7, and the reason the inventory in Part A exists.
3. **Terminal, chat, editor, worktree stay inside the client tab.** Revisit terminal-as-own-tab only after the browser work lands (differentiator D-8).
4. **Organising mode** should list the `pb-orca:` tab and, optionally, one row per Orca browser page. A richer projection (one row per Orca terminal or agent) can read `session.tabs.subscribe` without rendering the pane (differentiator D-7, unverified).

---

# PART C. Table stakes, differentiators, anti-features for v1.7

## Table Stakes

Features users expect. Missing = the Orca mode feels broken or unsafe.

| Feature | Why expected | Complexity | Notes / dependencies |
|---------|--------------|------------|----------------------|
| T-1 "Orca" mode next to Coding | Owner decision; seed decision 3 | Low | Append to `SHIPPED_MODES` (`theia/extensions/modes/src/browser/mode-descriptors.ts:22-50`) and `ChromeBarWidget.MODES` (`chrome-bar-widget.tsx:389`); `verify-mode-toggle-commands.mjs` checks both agree. Mode id is persisted (`mode-service.ts:696`; `setups-service.ts:673,946`): fix it before release. Survey names the mode "Orchestration"; INPUTS.md (later) says "Orca". |
| T-2 PB-spawned orcad lifecycle | PB must work without Orca desktop | High | Pinned fetch per OS with version and hash (like `scripts/fetch-upstream.sh`); spawn orcad directly with `--bind 127.0.0.1` and a fixed `--port`; data root `powerbrowser-orca` via `ORCA_USER_DATA`; strip inherited `ORCA_*`; explicit teardown (terminal daemon outlives orcad); assert `boundEndpoint` starts `ws://127.0.0.1:` (`orca-client-hosting.md` steps 1-6). Copies the `TheiaService.sys.mjs` spawn and token pattern. |
| T-3 Auto-pair and open the client in a web tab | Zero-prompt entry | Medium | Read `pairing.webClientUrl` from orcad's ready JSON; keep the fragment out of history, session restore, copy (bearer credential); match tabs by origin. Depends on `WebTabOpenHandler` and the web tab title override (`web-tab.ts:928-931`). |
| T-4 `pb-orca:` URI and registry mapping | Owner requirement; GUI-04 asserts registry shape | Low-Medium | Add coverage in `verify-uri-roundtrip.mjs` and `docs/URI-SCHEMES.md`; do not change `TabUriRegistry`'s exported shape (`verify-registry-shape.mjs`). |
| T-5 Orca tab moves between all four modes and is organisable | Owner requirement | Medium | Depends on Modes service and Setups restore for a tab that needs a live sidecar (restore must re-pair); Organising mode store rows are keyed `web:<id>` (`docs/TAB-STORE.md`). |
| T-6 Failure and recovery UX | orcad dies, port taken, pairing lost | Medium | Replace Orca's own "Can't reach Orca server" screen with a PB page; user-facing copy rules in CLAUDE.md (product named, plain language, a real next step, no ports or pref keys). Fixed port, fail visibly, never `--port 0` (a moving port drops all `orca.web.*` localStorage). |
| T-7 Add project works | Spike 003 finding 5: without it the client shows "No workspaces found" | Low-Medium | Stock path: in a runtime environment the Add-project dialog uses the server-side directory browser (`files.browseServerDir`, `src/renderer/src/components/sidebar/use-remote-file-browser-listing.ts`), because the web client's native pickers return null (`web-repositories-api.ts:48-50`). RPC `repo.add/repo.clone/repo.create` (`rpc/methods/repo.ts:135-171`). Verify live, and register or prompt for the first project. Flatpak needs `--filesystem=home` (INPUTS). |
| T-8 Credential-storage check | Owner scope; spike noted plaintext on temp profiles, "not yet checked for a persistent profile" | Low-Medium | orcad seals credentials with a key file, not the OS keyring, on a persistent profile (`orcad-secret-key-resolution.ts:150`, gap text `orcad-secret-protection-gap.ts`). It stores plaintext when `ORCA_HEADLESS_SECRET_STORE=plaintext` or when the profile directory is under `tmpdir`, `/tmp` or `/var/tmp` (`orcad-secret-key-resolution.ts:159-168`; `orcad-secret-key-record.ts:101-114`). The check: refuse or warn when `powerbrowser-orca` resolves under a temp directory, the env override is set, or the key record is missing/unreadable; read `<ORCA_USER_DATA>/orca-secret-protection.json` (`orcad-secret-store-startup.ts:13`; `secret-protection-report.ts:15-18`) for the reported gap. Text of the gap is English prose: match on the file's presence and `null`/non-`null`, not on wording. A key file beside the data is weaker than a keyring: say so in PB's own copy. |
| T-9 Orca's own browser surface is not misleading | Without a provider orcad reports browser unavailable | Low | Either hide Orca's browser entry points in the client (PB injection, decision 4) or route them to PB tabs. Do not ship a state where "new browser tab" shows a dead pane. |
| T-10 Pairing and agent defaults handled | Bearer credential; skip-permissions default | Low | `--dangerously-skip-permissions` stays (owner decision). Telemetry guard `DO_NOT_TRACK=1`. |
| T-11 Injection through a JSWindowActor | Owner decision 4 (logo to PB, settings seed, hide "Orca Mobile" and similar) | Medium | New catalogue row in `powerbrowser/INTERNAL-APIS.md`; the "no DOM write" privilege row widens; re-check selectors on every Orca re-pin. |
| T-12 Platform parity: Linux, macOS, Windows | Owner decision | High | Per-OS orcad bundle fetch; verified only on Linux/NixOS so far. |

## Differentiators

Not expected, valued. Each depends on the browser spike.

| Feature | Value | Complexity | Notes |
|---------|-------|------------|-------|
| D-1 Agents drive PB web tabs (Tier 1 of A.5) | The headline of "replace the embedded browser": agent browsing in the user's real engine and chrome | High | Needs seam choice S1 vs S2, an AX snapshot actor (A1-03), a BiDi session owner, and a `browserPageId` table. Biggest risk: S1 needs an upstream Orca PR; S2 needs a non-Electron host to be accepted. |
| D-2 Agent activity mark and cursor on the PB tab (U-09) | Trust; the user sees which tab an agent is using | Medium | PB chrome overlay. |
| D-3 Grab and annotate from PB chrome, sent to an Orca agent terminal (U-06, U-07) | Closes the loop from page to agent prompt | Medium-High | JSWindowActor for the grab scripts; `terminal.send` RPC. |
| D-4 Markup on screenshot (U-08) | Annotated screenshots for agents | Medium | BiDi screenshot plus PB widget. |
| D-5 Native folder picker feeding Add project | The web client's pickers return null; a PB-side picker (Gecko file picker or Theia dialog) gives a native feel | Low-Medium | Feeds the path into the same `repo.add` call; orcad and PB share one machine. Unverified how to inject the result into the client page (actor message vs typed path). |
| D-6 Local dev-server tiles on the new-tab page (U-12) | Fast path to the page an agent just started | Low-Medium | Needs a port-scan or Orca `ports` RPC (`src/main/ports`, unverified). |
| D-7 Organising mode lists Orca terminals and agents | Orca work appears in PB's tab model without the pane | Medium-High | `session.tabs.subscribe` projection; read-only, activate by RPC. Unverified. |
| D-8 Terminal as its own PB tab | Move a terminal to Coding mode | High | See B.1; defer past v1.7. |
| D-9 PB browsing profile shared with agents (logged-in sessions) | Agents reuse the user's Firefox login state | Medium | Orca's equivalent is cookie import; here it is automatic but raises a consent question. |

## Anti-Features

| Anti-feature | Why avoid | What to do instead |
|--------------|-----------|--------------------|
| Re-skin Orca's UI copy, or serve an edited copy of the bundle through `--web-client-root` | About 1,388 hard-coded "Orca" strings; editing is patching and vendoring (survey sections 5-6) | Keep Orca copy. Change only PB-owned surfaces and use injection for hides. |
| Patch or fork Orca, or add a Gecko provider by local patch | Project rule; Orca is a pinned upstream | S2 (host role in PB code), or an upstream Orca PR for S1. |
| Emulate CDP in Gecko so `agent-browser` can attach | CDP is gone from Gecko 141+; the binary is CDP-only; large and brittle | Native BiDi implementation of the Orca commands. |
| Keep the stock remote screencast browser pane | Pixel streaming of a second engine; stubs everywhere (A.0) | PB web tabs. Hide the pane. |
| Port Orca's WebExtension host, profile partitions, cookie import, SSH tunnels, mobile driver overlay | Desktop-only Electron features, stubbed off in the web client (`web-browser-api.ts`) | PB's own extension track and Firefox profile. |
| Promise the free-form `orca exec` vocabulary | It belongs to a CDP-only binary (A1-09) | Document a subset; return `browser_command_unavailable` for the rest. |
| Deep-link one Orca view by hiding the rest of the page with injected CSS | Fragile, breaks on every re-pin, not a stable API | Whole-client tab plus separate browser tabs (B.2). |
| Run orcad on the user's real Orca profile or `~/.config/orca` | Profile lock and shared hook files | Dedicated `powerbrowser-orca` data root. |
| Expose a BiDi TCP port in the shipped browser for the agent bridge | Any local process could drive the browser; BiDi allows one session | Keep the bridge inside PB; evaluate in-process use of the remote-agent modules (unverified). |
| Custom PB browser chrome for Orca (own tab strip, toolbar) | Hard rule 5 in CLAUDE.md: no custom browser chrome is authored | Add only what the inventory proves necessary, as page overlays or Theia widgets. |

## Feature Dependencies

```
Pinned orcad fetch (T-2, T-12) -> orcad spawn + teardown (T-2) -> auto-pair + web tab (T-3)
T-3 -> pb-orca: URI (T-4) -> tab moves + Organising (T-5)
T-3 -> failure UX (T-6)
T-2 -> credential check (T-8)            (needs the data-root path)
T-3 -> Add project verified (T-7)        (client must be paired and a project registered)
T-1 mode -> T-3 (the mode hosts the tab)
T-11 injection -> hides + settings seed (also T-9 hide dead browser entry points)
Spike (browser inventory, S1/S2 choice)
  -> D-1 agent-driven PB tabs -> D-2 activity mark, D-3 grab/annotate, D-4 markup
  -> T-9 final form (hide vs route Orca browser entry points)
Existing PB: TabUriRegistry, web-tab.ts (address = page URL), modes service, setups restore,
             chrome bar (find, zoom, print, history done; downloads and site info per REQUIREMENTS)
```

Dependencies on existing PB: `TabUriRegistry` shape is asserted by `scripts/verify-registry-shape.mjs`; the web tab has no per-Orca page id, so the id table is new; chrome bar items that Orca users expect (downloads, site info, permissions) are unchecked in `REQUIREMENTS.md` and need a state check before the Orca browser claims parity.

## MVP Recommendation

Prioritize:
1. T-1, T-2, T-3, T-4, T-6, T-8, T-7, T-9 (hide), T-11: Orca mode hosts the stock client, safe credential posture, projects can be added, dead browser entry points hidden.
2. The browser spike, scoped by A.0 seam choice and the open questions below, before any build.
3. T-5: tab moves and Organising rows, once the singleton tab shape is settled.
4. Then D-1 Tier 1, with D-2 (activity mark) shipped with it because agents driving a user's browser need visible state.

Defer: D-3, D-4 (after Tier 1), D-5, D-6, D-7, D-8, D-9; all Tier 3 items.

## Questions the spike must answer (derived from this inventory)

1. S1 vs S2: can a PB-side client attach through `browser.clientHost.attach` with a web-client device token, and do the 65 `automation` methods plus `createPage/navigate/closePage` suffice? Or is an upstream Orca provider the only route?
2. Snapshot: can a content actor produce a tree with stable `@eN` refs that survive Orca's delta mode (A1-03)? Cost and fidelity versus `Accessibility.getFullAXTree`.
3. Input and focus: does `input.performActions` work on a background PB web tab without taking user focus (U-10)? What does the overlay model do to coordinates and DPR for screenshot-to-mouse alignment (A1-04, A1-05)?
4. BiDi session ownership: who holds the single BiDi session in the shipped browser, and over which transport (A.0 finding 4)?
5. Prompt and popup handling on overlays: re-test `handleUserPrompt` and popup contexts, which went through a `TabManager` path that returned null for overlays.
6. Link routing: where does an `http` link clicked in an Orca terminal or chat open (U-23)?
7. Can two `pb-orca:` client tabs share one orcad without conflicting layouts (B.2 point 1)?
8. Which Orca re-pin changes break the injection selectors (T-11)?

## Gaps and confidence

| Area | Confidence | Basis |
|------|------------|-------|
| Orca browser inventory (A.1-A.3) | HIGH | Read from source with cites; counts by script (80 CLI specs, 83 RuntimeBrowserCommands members, 65 automation methods, 83 CDP names) |
| Gecko capability (A.4) | HIGH for command presence (read in the 153.5.1 tree), HIGH for version gaps (MDN BCD data fetched 2026-11-04) | |
| Gecko mapping per feature | MEDIUM-LOW | All "guess" labels; only navigation, screenshot and pointer/keyboard through performActions were exercised, in spike 003 |
| `agent-browser` binary behaviour | LOW | Strings only; its source was not read; README via WebFetch |
| S2 acceptance of a non-Electron host | LOW | Not tried |
| PB chrome state (downloads, site info, bookmarks) | LOW | `REQUIREMENTS.md` is the v1.5 list and its checkboxes disagree with `PROJECT.md`'s statement that history and bookmarks exist |
| Installed 1.4.245 vs source 1.4.214 | MEDIUM | Not diffed |

## Sources

- Orca source tree `/home/chris/coding/orca-eval` (HEAD 3052dd79): files cited inline. HIGH.
- Installed build `/nix/store/zqzrjgzy297m4b7pgr0k2165l3wmhix8-orca-ide-1.4.245-extracted/resources/` (agent-browser binary string scan). MEDIUM.
- Gecko tree `/home/chris/coding/Power-Browser/upstream` at 153.5.1: `remote/webdriver-bidi/modules/root/*.sys.mjs`, `remote/marionette/driver.sys.mjs`, `remote/components/RemoteAgent.sys.mjs`. HIGH.
- MDN browser-compat-data `webdriver/bidi/*.json` (raw GitHub, package 8.1.8) for Firefox version numbers. HIGH.
- https://fxdx.dev/deprecating-cdp-support-in-firefox-embracing-the-future-with-webdriver-bidi/ and https://fxdx.dev/cdp-retirement-in-firefox/ (CDP removed in Firefox 141; ESR exception for older ESR). MEDIUM (search snippet; the tree check above confirms for 153).
- https://github.com/vercel-labs/agent-browser (README: CDP, `--engine` Lightpanda/Obscura, command list). MEDIUM.
- https://w3c.github.io/webdriver-bidi/ (module and command names). HIGH.
- PB planning inputs: `.planning/workstreams/orca/research/INPUTS.md`, `NOTE-orca-tab-parity-direction.md`, `ORCA-REBRAND-SURVEY.md`, `.planning/seeds/SEED-261103-o1g-orca-mode-milestone.md`, `.claude/skills/spike-findings-Power-Browser/references/orca-client-hosting.md`, `docs/URI-SCHEMES.md`, `REQUIREMENTS.md`, `scripts/lib/firefox-bidi.mjs`.
