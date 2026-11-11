---
phase: 66-powerbrowser-web-tabs-as-orca-s-browser
verified: 2026-11-11T20:41:43Z
status: gaps_found
score: 16/18 must-haves verified
covered_files:
  - ".planning/workstreams/orca/phases/66-powerbrowser-web-tabs-as-orca-s-browser/66-01-PLAN.md"
  - ".planning/workstreams/orca/phases/66-powerbrowser-web-tabs-as-orca-s-browser/66-01-SUMMARY.md"
  - ".planning/workstreams/orca/phases/66-powerbrowser-web-tabs-as-orca-s-browser/66-02-PLAN.md"
  - ".planning/workstreams/orca/phases/66-powerbrowser-web-tabs-as-orca-s-browser/66-02-SUMMARY.md"
  - ".planning/workstreams/orca/phases/66-powerbrowser-web-tabs-as-orca-s-browser/66-03-PLAN.md"
  - ".planning/workstreams/orca/phases/66-powerbrowser-web-tabs-as-orca-s-browser/66-03-SUMMARY.md"
  - ".planning/workstreams/orca/phases/66-powerbrowser-web-tabs-as-orca-s-browser/66-04-PLAN.md"
  - ".planning/workstreams/orca/phases/66-powerbrowser-web-tabs-as-orca-s-browser/66-04-SUMMARY.md"
  - ".planning/workstreams/orca/phases/66-powerbrowser-web-tabs-as-orca-s-browser/66-05-PLAN.md"
  - ".planning/workstreams/orca/phases/66-powerbrowser-web-tabs-as-orca-s-browser/66-05-SUMMARY.md"
  - ".planning/workstreams/orca/phases/66-powerbrowser-web-tabs-as-orca-s-browser/66-06-PLAN.md"
  - ".planning/workstreams/orca/phases/66-powerbrowser-web-tabs-as-orca-s-browser/66-06-SUMMARY.md"
  - ".planning/workstreams/orca/phases/66-powerbrowser-web-tabs-as-orca-s-browser/66-07-PLAN.md"
  - ".planning/workstreams/orca/phases/66-powerbrowser-web-tabs-as-orca-s-browser/66-07-SUMMARY.md"
  - ".planning/workstreams/orca/phases/66-powerbrowser-web-tabs-as-orca-s-browser/66-08-PLAN.md"
  - ".planning/workstreams/orca/phases/66-powerbrowser-web-tabs-as-orca-s-browser/66-08-SUMMARY.md"
  - "inventory/brand-tokens.json"
  - "orca-overlay/files/src/renderer/src/pb/browser-host/pb-browser-host-link.ts"
  - "orca-overlay/files/src/renderer/src/pb/browser-host/pb-browser-host.ts"
  - "orca-overlay/files/src/renderer/src/pb/pb-pane-mount.tsx"
  - "orca-overlay/seams.json"
  - "powerbrowser/INTERNAL-APIS.md"
  - "powerbrowser/shell/GroupActorChild.sys.mjs"
  - "powerbrowser/shell/PowerBrowserAPI.sys.mjs"
  - "powerbrowser/shell/powerbrowser.js"
  - "scripts/lib/orca-browser-live.mjs"
  - "scripts/verify-no-remote-agent-port-live.mjs"
  - "scripts/verify-orca-agent-mark-live.mjs"
  - "scripts/verify-orca-browser-abilities.mjs"
  - "scripts/verify-orca-browser-agent-live.mjs"
  - "scripts/verify-orca-browser-entry-points.mjs"
  - "scripts/verify-orca-browser-tab-scope.mjs"
  - "scripts/verify-orca-browser-tools.mjs"
  - "scripts/verify-platform.sh"
  - "theia/extensions/chrome-bar/src/browser/chrome-bar-copy.ts"
  - "theia/extensions/chrome-bar/src/browser/chrome-bar-widget.tsx"
  - "theia/extensions/orca-browser/src/browser/orca-browser-frontend-module.ts"
  - "theia/extensions/orca-browser/src/common/orca-browser-abilities.ts"
  - "theia/extensions/orca-browser/src/common/orca-browser-dispatch.ts"
  - "theia/extensions/orca-browser/src/common/orca-browser-tools.ts"
  - "theia/extensions/orca-panes/src/browser/orca-pane-observer.ts"
  - "theia/extensions/orca-panes/src/browser/orca-pane-routes.ts"
  - "theia/extensions/tab-uris/src/browser/web-tab.ts"
  - "website-staging/privacy.html"
covered_digest: "v3:sha256:fe8d50ca1287ef91f7b6b99de041fe5584f132b6f801c9180fa722735233ac8b"
behavior_unverified: 0
overrides_applied: 0
re_verification:
  previous_status: gaps_found
  previous_score: 11/12
  gaps_closed:
    - "The five new-window receivers (createContentWindow, createContentWindowInFrame, openURI, openURIInFrame, openLinkIn) and the popup-with-features route refuse an agent opener: no overlay, no stock window, no load (66-08, D-35)"
  gaps_remaining:
    - "Pages an agent tab opens stay inside the agent isolation: a download from an agent page still opens its viewer in the user's stock browser window, or opens a new stock window"
  regressions: []
gaps:
  - truth: "Pages an agent tab opens stay inside the agent isolation (D-35: no new window, tab or popup exists for an agent-overlay opener on any open path; not adopted, not sent to a stock window)"
    status: failed
    reason: >-
      66-08 closed every path that runs through installNewWindowReceivers, and the content wall closes the
      popup-with-features path. One path does not go through either: a download that an agent page starts. A page an
      agent drives can start a download with a plain navigation (browser.goto to an http(s) URL served with
      Content-Disposition: attachment) or a trusted click on such a link. Overlay downloads save to the user's
      Downloads folder with no prompt; the page-tools-live probe records "saved-to-download-dir-without-prompt"
      for a user overlay, and the agent overlay uses the same path. For a type whose preferred action is
      handleInternally (PDF by default; PowerBrowser sets no download or pdfjs pref), Gecko marks the download
      launchWhenSucceeded and handleInternally with no prompt (nsExternalHelperAppService.cpp:1818-1836).
      DownloadIntegration.launchDownload then calls DownloadUIHelper.loadFileIn (DownloadIntegration.sys.mjs:889-909).
      loadFileIn rejects the shell window, because its windowtype is powerbrowser:main and not navigator:browser
      (powerbrowser.xhtml:21). It therefore opens the file through openTrustedLinkIn in the top stock browser
      window. If no stock window is open, it opens a new one at BROWSER_CHROME_URL (DownloadUIHelper.sys.mjs:83-131).
      Neither route reaches adoptLinkIn, so agentOpenRefused is never consulted. The resulting tab is in the
      stock window: the "browsers" message manager group, no agent mark, not covered by Stop. A new stock window
      takes the user's view. The tab does keep the agent container, because loadFileIn passes the download's
      userContextId. Its URL is file://, and the agent page holds no reference to it. The exposure is therefore
      lower than the original gap: no saved password and no user-jar cookie reaches the agent. It still breaks
      D-35's rule ("not sent to a stock window ... on every path") and the privacy sentence "An agent never
      reaches your other tabs or your browser windows". A related effect: an agent page can write any file it
      serves into the user's Downloads folder, and the file appears in the user's downloads panel. No PB code
      looks at a download's source container. The downloads view (PowerBrowserAPI.sys.mjs:7189-7213) only
      serializes rows. This is derived from the code and has not been proven live.
    artifacts:
      - path: "powerbrowser/shell/PowerBrowserAPI.sys.mjs:7189-7213"
        issue: "downloadsView.onDownloadAdded serializes every download; nothing refuses, or stops the launch of, a download whose source is an agent overlay (source.userContextId equal to the agent container, or source.browsingContextId whose top embedder is an agent overlay)"
      - path: "powerbrowser/shell/PowerBrowserAPI.sys.mjs:11268-11276"
        issue: "agentTabCreated installs the content wall and the focus guard, but no download refusal for the overlay"
      - path: "upstream/toolkit/components/downloads/DownloadUIHelper.sys.mjs:83-131"
        issue: "(upstream, not to be edited) the shell window is not navigator:browser, so the viewer goes to getTopWindow() (a stock window) or to a new BROWSER_CHROME_URL window"
      - path: "scripts/verify-orca-browser-tab-scope.mjs:580-600"
        issue: "openPaths derives only what installNewWindowReceivers installs, so a path that bypasses the receivers (download viewer, external protocol) is outside the derivation and no plant can cover it"
    missing:
      - "Refuse downloads whose source is an agent overlay. One way: in the downloads view's onDownloadAdded (or a Downloads list view registered in the agent section), when download.source.userContextId equals the agent container id or the source browsing context's top embedder is an agent overlay, finalize(true) the download (removing the partial file) before it succeeds. Log once per tab without the URL. An agent command in flight then answers browser_command_unavailable, as agentOpenRefused does. Alternatively, keep agent downloads and set launchWhenSucceeded = false, but D-35 and the privacy page then need a sentence about files an agent saves"
      - "orca-browser-agent-live: a clause that first proves a user tab's attachment download of a PDF opens its viewer, or at least saves (the detector). It then requires that the same navigation from an agent tab saves no file to the profile's download dir, opens no stock tab or window, and leaves the user's current tab unchanged"
      - "A tab-scope (stub-boundary) clause with a plant that drops the download refusal"
      - "Re-read privacy.html:86 against the result, and add a sentence on agent downloads if they are kept rather than refused"
  - truth: "Content wall: an agent overlay's browsing context carries SANDBOXED_AUXILIARY_NAVIGATION from creation, before its first load; a user overlay never does"
    status: partial
    reason: >-
      The browsing context field is set in agentTabCreated (PowerBrowserAPI.sys.mjs:11272), after appendChild has
      created the remote frame loader and before firstWebTabLoad navigates. Every document created after that carries
      the flag, and live clause (n) read sandboxFlags 2 on the loaded /opener page. The overlay's initial about:blank
      document, however, is created in the content process by the browser construction that appendChild sends.
      A document takes its sandbox flags only at creation (nsDocShell.cpp:6619-6686). Setting the field later does not
      update an existing document. So the initial about:blank probably carries no SANDBOXED_AUXILIARY_NAVIGATION. It
      stays the current document until the first real load commits: at least the 25 ms polling of firstWebTabLoad
      (:3813-3825), and for a slow first URL the whole network wait. During that window the wall already admits
      agent commands. A browser.mouseClick gives the document transient activation, and then a browser.eval of
      window.open(url, name, "popup") takes the OPEN_NEWWINDOW route. That route has no chrome receiver
      (ContentParent.cpp CommonCreateWindow → nsWindowWatcher::OpenWindowWithRemoteTab), so a stock popup window
      would open. Not proven: no check evaluates an open in the initial document, and the inference about IPC
      ordering is mine. No chrome code on this route can refuse it.
    artifacts:
      - path: "powerbrowser/shell/PowerBrowserAPI.sys.mjs:11268-11276"
        issue: "the flag is written after the frame loader exists, so the initial about:blank document may predate it"
      - path: "powerbrowser/shell/PowerBrowserAPI.sys.mjs:11202-11213"
        issue: "agentWallVerdict admits commands before the first load commits"
    missing:
      - "A live probe: create an agent page for a deliberately slow URL, then immediately run mouseClick and then eval window.open(..., 'popup') and record whether a stock window opens and what document.sandboxFlags-equivalent state the initial document has (for example, window.open throwing InvalidAccessError or not)"
      - "If it opens: refuse agent commands until the first load has committed (entry.firstLoad cleared and the current document is not the initial about:blank), or set InitialSandboxFlags before the remote browser is constructed, if Gecko offers a pre-construction hook. Add a tab-scope plant for whichever guard is chosen"
deferred: []
---

# Phase 66: PowerBrowser web tabs as Orca's browser Verification Report

**Phase Goal:** Orca's agents and the user browse in PowerBrowser web tabs with PowerBrowser chrome. Agent control reaches only Orca-created tabs, and the user can see it and stop it.
**Verified:** 2026-11-11T20:41:43Z
**Status:** gaps_found
**Re-verification:** Yes, after gap closure 66-08 (D-35) and Phase 67's merge

## What changed since the initial verification

- **The original gap is closed for the paths it named.** Truth 8 named `window.open`, `target=_blank`, a middle-click and Enter on a link. Each one now opens nothing from an agent page. The evidence: the code (below), my own plants against the derived tab-scope clause, and the coordinator's raw live output `.mozbuild/p66-08/agent-live-2.txt`, clause (n).
- **Phase 67's merge did not touch the guarded code.** `git diff 368a3f44..HEAD` on `PowerBrowserAPI.sys.mjs` has four hunks: one `SHELL_MESSAGE_KINDS` line (:304), one `registerOrcaLogoActor()` call (:2296), one `case` line (:2332), and the appended Orca-hosting section after the agent bridge's end marker (:11770+). The adopt section, `installNewWindowReceivers`, `webTabOpen`'s literal and the agent section are byte-identical, shifted 2 lines. The 43 lines `GroupActorChild.sys.mjs` gained are the logo child after `agentSnapshot`, and its actor `matches` only the Theia origin. The p66-08 live runs predate the merge (08:41-08:55, merge 09:20), and the merge did not change the code they exercised.
- **One open path remains (new Gap 1).** A download started by an agent page opens its viewer in the stock window. **One property of the content wall is unproven (new Gap 2):** the initial `about:blank` may not carry the flag.
- **A claim in the 66-08 SUMMARY is wrong.** It says an external-protocol link raises "a prompt, not a window". In PB that prompt is a standalone chrome window (Security finding 3).

## Method

- The code I read: the adopt section (`PowerBrowserAPI.sys.mjs:7395-7560`), `installNewWindowReceivers` (:4362-4386), `webTabOpen` (:3577-3680), the agent section (:11120-11345, :11545, :11695-11770), `tabsBridgeCreate` (:10568), the page context menu capture (:8652), `firstWebTabLoad` (:3813), the downloads view (:7137-7213), the gBrowser stand-in (`powerbrowser.js:78-140`), the agent child's input rows (`GroupActorChild.sys.mjs:255-300, :472-481`), and the tab-scope opens clause (`verify-orca-browser-tab-scope.mjs:565-718`).
- The upstream code I read for each candidate open path is cited in the table under "Open paths 66-08 might have missed".
- I ran 17 quick rows one at a time under `nix develop .#theia` with `scripts/verify-platform.sh --only <label>`. All passed (table below).
- I planted faults in a scratch harness that imports the shipped tab-scope exports. Each guard removal went red, and so did a sixth receiver member nobody wrote.
- I did no live runs and no builds. The live evidence is the coordinator's raw output in `.mozbuild/p66-08/`.

## Goal Achievement

### Observable Truths

Truths 1-12 are carried from the initial verification. Truths 13-18 are the 66-08 plan's must-haves (its seventh must-have, the re-runs, is truth 18).

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | SC1: a browser page Orca or an agent opens is a PB web tab with PB's chrome bar; each Orca browser-pane entry point routes to a PB web tab; the screencast pane is never shown | VERIFIED (regression check) | `orca-browser-entry-points` PASS today; route and observer files unchanged since the initial pass |
| 2 | SC2: agent navigation, click, type, screenshot through the chrome bridge; a non-Orca tab is refused; no BiDi port listens, the detector proven by a control run | VERIFIED (regression check) | `orca-browser-tab-scope` PASS: 40 methods each refused for a user, unknown, foreign, wrong-container or stopped tab. `handleWebTabAgent` and the wall are unchanged except 66-08's refusal count (:11701, :11711) |
| 3 | SC3: the "agent is controlling" mark with Stop; Stop ends control; a stock window shows no mark | VERIFIED (regression check) | `.mozbuild/p66-08/orca-agent-mark-live.txt` PASS on the 66-08 tree. `orca-agent-mark-live-self-test` PASS today |
| 4 | SC4: each user-facing tool in the Phase 61 inventory is reachable; a set comparison proves it | VERIFIED (regression check) | `orca-browser-tools` PASS today |
| 5 | Chrome wall: only an agent-flagged overlay this frontend created, in its own container and not stopped, accepts agent kinds | VERIFIED (regression check) | `agentWallVerdict` :11202-11213 and `agentInOwnContainer` :11218-11221 are unchanged |
| 6 | Agent overlay isolation: agent container, no LoginManager, no autocomplete, dialogs limited to alert/confirm/prompt, HTTP auth and beforeunload refused | VERIFIED (regression check) | The literal override is at :3620. `AGENT_DIALOG_TYPES` is at :11545 and `inPermitUnload` is refused at :11552. The LoginManager registry clause passes inside tab-scope. Live agent-live-2 clauses (e), (e2) "agent container 6", (l) and (m) passed again on the 66-08 tree |
| 7 | Agent tabs open in the background and never take focus; a parked overlay gives focus back | VERIFIED (regression check) | `agentFocusGuardInstall`/`agentFocusGuard` :11318-11335 are unchanged. Live (c), (c2) |
| 8 | Pages an agent tab opens stay inside the agent isolation (D-35: refused on every open path) | FAILED (narrowed) | **Closed:** the five receivers and the popup-with-features route (truths 13-17). **Open:** the download viewer (Gap 1). An agent page's PDF download opens in the user's stock window, or in a new stock window, through `DownloadUIHelper.loadFileIn`, which no PB guard sees |
| 9 | The remote-debugging port is never open in a shipped launch | VERIFIED (regression check) | No shipped config changed. Phase 67 adds no remote-agent import |
| 10 | Seams only 010, 070, 080; no Theia core edit; no tracked Orca edit | VERIFIED (regression check) | `orca-overlay` PASS (3 seams). 66-08's commit touches no `orca/`, `orca-overlay/patches` or `seams.json` file. `git -C upstream diff` is empty |
| 11 | Firefox internals only through the boundary file plus catalogued GroupActorChild rows | VERIFIED | `internals-boundary`, `internals-catalogue` and `ng-040-internals-catalogue-lines` PASS today. 66-08 added rows for `Cr.NS_ERROR_ABORT` and the `sandboxFlags` write |
| 12 | D-34 store rows keyed by browserPageId; reveal with no second widget; row dropped on close | VERIFIED (regression check) | `orca-browser-abilities` PASS. Live (j) "reveal in 11 ms" |
| 13 | Content wall: SANDBOXED_AUXILIARY_NAVIGATION on the agent browsing context from creation, before its first load; never on a user overlay | UNCERTAIN (Gap 2) | Set at :11272, after the frame loader exists and before `firstWebTabLoad`. Inherited by subframes (`nsFrameLoader.cpp:3072-3075`) and copied on a browsing-context replacement (`CanonicalBrowsingContext.cpp:356-357`). Live (n): `sandboxFlags 2`, and `window.open` with and without features threw InvalidAccessError. Not established: the initial `about:blank` document, which is created before the field is written and is current until the first load commits |
| 14 | Chrome wall: every receiver `installNewWindowReceivers` installs refuses an agent opener; the browserDOMWindow members throw; openLinkIn opens nothing for every where | VERIFIED | `adoptLinkIn` :7445 returns null before the `where` branch, so "window" never reaches `openStockTab`. `adoptContentWindow` :7484 calls `agentOpenGuard` before the print/Theia null. `adoptInProcessWindow` :7498-7501 handles both in-process members (:4366-4377). `agentOpenGuard` :11308-11313 throws `NS_ERROR_ABORT`; ContentParent treats a failure as a refusal and a null as "open a stock window". `createPendingOverlay`'s only other caller, `tabsBridgeCreate` :10592, is extension-initiated, not an agent-page path |
| 15 | A chrome-refused open is logged once per tab and path without the URL; an in-flight agent command answers `browser_command_unavailable` | VERIFIED | `agentOpenRefused` :11292-11305 logs the path name with no URL, through a per-entry Set. `handleWebTabAgent` :11701/:11711 turns a `done` into the failure when the count moved. The tab-scope clause has a positive `done` control. Live (n): middle-click and Control+Enter answered `failed browser_command_unavailable` |
| 16 | orca-browser-tab-scope derives every open path from `installNewWindowReceivers`, requires the guard at every OPEN_* location from the pinned IDL, one generated plant per path | VERIFIED | PASS today: "5 open paths derived ... at any of 12 OPEN_* locations or 6 link wheres". Self-test: 30 plants red. My own plants against the shipped source went red in five cases: link guard dropped, InFrame guard dropped, in-process guard dropped, content wall dropped, and a new unguarded `openURIInNewWindow` member (derived as a 6th path and red). Limit: the derivation sees only the receivers, so Gap 1's path is outside it |
| 17 | orca-browser-agent-live clause (n): user opens adopt first (detectors), then agent opens create no tab, window or load; current tab and focus unchanged; the agent's own link click still navigates | VERIFIED | `.mozbuild/p66-08/agent-live-2.txt`: "clause (n) ok (user: link 1 tab, window.open 1 tab, popup 1 window; agent: 0 tabs, 0 windows, 0 loads, ... sandboxFlags 2)". `verdictOpens` (:251-275) requires `ownNavigation`, with plant `agent-own-navigation-blocked` (:778). `orca-browser-agent-live-self-test` PASS today |
| 18 | The listed live and quick rows were re-run; --quick green; nothing pushed | VERIFIED | p66-08 files: agent-live 1 and 2 PASS, mark-live PASS, new-window-adopt-live 12/12 PASS. `quick.txt` was red only on `fixer-isolate-self-test`, whose cause is the sandbox's socket (outside this phase). My 17 rows passed today |

**Score:** 16/18 truths verified (0 present, behavior-unverified). 1 FAILED (truth 8, Gap 1), 1 UNCERTAIN (truth 13, Gap 2).

### Open paths 66-08 might have missed (checked from current code)

| Candidate | Verdict | Evidence |
|-----------|---------|----------|
| window.open / target=_blank / form target (InFrame members) | Closed | Truth 14. Content wall first, chrome throw second |
| Popup with features, shift-open (OPEN_NEWWINDOW, no chrome receiver) | Closed after first load; see Gap 2 for the initial document | `nsWindowWatcher.cpp:980-983` refuses when the active document carries the flag |
| Middle-click, modified click, Enter, every `where` | Closed | `adoptLinkIn` :7445. Live (n) |
| In-process members | Closed | :7498-7501 |
| Print (`OPEN_PRINT_BROWSER`) | Closed | The guard runs before the print null at :7484-7487 |
| Document PiP (`documentPictureInPicture.requestWindow`) | Closed by the content wall (same caveat as Gap 2) | `DocumentPictureInPicture.cpp:148` opens through `OpenWindow2` with `PRINT_NONE`, so it meets the window-watcher sandbox check; the call also needs transient activation |
| Video PiP (toggle click or `requestPictureInPicture`) | Not reachable | `PictureInPictureLauncher`, `PictureInPicture` and `PictureInPictureToggle` are registered only for `browsers` (and `pip-player`) (`ActorManagerParent.sys.mjs:739-775`). Agent overlays are in `powerbrowser-orca-agent` |
| View-source, `about:`, `chrome:`, `file:` (navigation into a privileged page) | Not reachable | `browser.goto` goes through `webTabNavigate` :4147, which accepts http(s) and about:blank only, with a null principal. Page-initiated loads of those schemes are refused by Gecko's CheckLoadURI. Back and forward stay in the tab's own history |
| Context menu raised by trusted synthetic right-click | Not an agent open path | A parked overlay's capture is refused (`overlayShownToUser`, :8652). On a shown agent tab the menu opens, but "Open link in new tab" runs only on a user's pick (`runPageMenuRow` :8801). The agent's input cannot reach the Theia menu |
| Drag-and-drop of a link | Not an open path | `browser.drag` (`GroupActorChild.sys.mjs:472-481`) synthesizes mouse events in the page's own window. No drop target outside the page receives them, and no window is created |
| Extension `tabs.create` with the agent tab as opener | Not an agent-page path | `tabsBridgeCreate` :10568-10596 is extension-initiated. Agent overlays are in the extension tab host (`tabHostAddTab` :3662), which is the pre-existing design |
| **Download → viewer** | **Open: Gap 1** | `nsExternalHelperAppService.cpp:1818-1836` → `DownloadIntegration.sys.mjs:889-909` → `DownloadUIHelper.sys.mjs:83-131` (stock window or a new one). No PB guard |
| **External protocol (mailto:, zoommtg:, ...)** | **Open, owner item** | Security finding 3 |

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `powerbrowser/shell/PowerBrowserAPI.sys.mjs` | `agentOpenRefused`, `agentOpenGuard`, `adoptInProcessWindow`, the content wall in `agentTabCreated` | VERIFIED | :11288 `SANDBOXED_AUXILIARY_NAVIGATION = 0x2` matches `nsSandboxFlags.h:32`. Wired from all five receivers |
| `scripts/verify-orca-browser-tab-scope.mjs` | `opensClause`, `receiverPlants` | VERIFIED | :602, :693; registered rows PASS |
| `scripts/verify-orca-browser-agent-live.mjs` | clause (n), `verdictOpens` | VERIFIED | :251, :441 (fixture `/opener`) |
| Earlier artifacts (agent section, GroupActorChild agent child, orca-browser extension, web-tab, chrome-bar, overlay host) | as initial pass | VERIFIED (regression check) | Unchanged apart from Phase 67's additive hunks |

### Key Link Verification

| From | To | Via | Status |
|------|----|-----|--------|
| `installNewWindowReceivers` | `agentOpenRefused` | `adoptLinkIn` (:7445), `adoptContentWindow` (:7484), `adoptInProcessWindow` (:7499) | WIRED |
| `agentOpenRefused` | `handleWebTabAgent` | `control.openRefusals` read at :11701/:11711 | WIRED |
| `webTabOpen` agent branch | content wall | `agentTabCreated` (:3655 call, :11272 write) | WIRED (timing caveat, Gap 2) |
| Earlier seven links (attach stream, `webTabAgent`, actor rows, mark push, Stop, store reveal, `followRow`) | | | WIRED (unchanged) |

### Behavioral Spot-Checks (run by this verifier, quick rows only)

| Row | Result |
|-----|--------|
| orca-browser-tab-scope / -self-test | PASS / PASS (30 plants) |
| new-window-adopt / -self-test | PASS / PASS |
| gui02-web-tab-bridge / -self-test | PASS / PASS |
| orca-browser-agent-live-self-test, orca-agent-mark-live-self-test | PASS, PASS |
| internals-boundary, internals-catalogue, ng-040-internals-catalogue-lines | PASS |
| orca-browser-abilities, orca-browser-entry-points, orca-browser-tools | PASS |
| orca-overlay, privacy-hosts, shell-error-copy-no-internals | PASS |
| Scratch plants against `opensClause` (shipped source plus 5 edits) | shipped GREEN; each of the 5 plants RED, naming its path |

### Probe Execution

No `scripts/*/tests/probe-*.sh` is declared by 66-08. Live rows were not run (instruction). The p66-08 raw outputs were read directly.

### Requirements Coverage

| Requirement | Source Plans | Status | Evidence |
|-------------|--------------|--------|----------|
| BRW-02 | 66-01, 66-02, 66-05, 66-07 | SATISFIED | Truths 1, 12 |
| BRW-03 | 66-01..66-04, 66-07, 66-08 | SATISFIED for agent control. The isolation of agent-caused pages is still open (Gap 1) | Truths 2, 5, 6, 9, 14-17. Agent control still reaches only Orca-created tabs. The download viewer is not agent-controlled, but it is placed in the user's window |
| BRW-04 | 66-03, 66-05 | SATISFIED | Truth 3 |
| BRW-05 | 66-05 | SATISFIED | Truth 4 |

No orphaned requirement.

### Prohibitions (judgment tier; non-authoritative LLM-judge verdicts)

| Prohibition | Verdict |
|-------------|---------|
| 66-08: no edit to Theia core, `upstream/`, tracked `orca/` files or the ledger; no new seam | Holds: 368a3f44 touches 7 files, none of them in those trees. `git -C upstream diff` is empty. Seams are still 3 |
| 66-08: hunks only in the open/adopt functions and the agent section | Holds: the 61-line diff to the API file sits in the adopt section, two receiver bodies (line-neutral) and the agent section |
| 66-08: no ready line, pairing URL, offer, token or saved password in output | Holds for the p66-08 files I read |
| 66-08: no push, explicit-path commits, no check weakened | Not independently re-derivable for the push. No check was weakened: tab-scope gained 13 plants and agent-live gained 15 |
| Earlier prohibitions (66-01..66-07) | Unchanged from the initial pass |

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| PowerBrowserAPI.sys.mjs | 11398 | `shortcut:` comment on the navigation settle polling (carried) | Info | Documented limit with an upgrade trigger |
| 66-08 changed files | — | TBD/FIXME/XXX | none found | — |

### Security Findings

1. **Blocker (Gap 1): an agent page's download opens outside the agent isolation.** The path is a PDF (handleInternally) download that leads to `DownloadUIHelper.loadFileIn`. The viewer opens as a stock-window tab, or as a new stock window when none is open, with no mark and no Stop, and the file is written to the user's Downloads folder. This is derived from the code and not live-proven. The tab keeps the agent container and the agent page has no handle on it, so no password or user cookie reaches the agent. It still breaks D-35's "not sent to a stock window" and the privacy sentence. Fix site: `PowerBrowserAPI.sys.mjs:7189-7213` (downloads view) or the agent section near :11268.
2. **Warning (Gap 2): the initial `about:blank` of an agent overlay may lack the content wall.** If it does, an agent can open a stock popup window, using a click and then an eval of `window.open(..., "popup")`, before the first load commits. Unproven: it needs one live probe.
3. **Warning, owner item (already listed in 67-06 as "External protocols"; corrected here):** The 66-08 SUMMARY calls the external-protocol prompt "a prompt, not a window". In PB the shell's gBrowser stand-in (`powerbrowser.js:78`) has no `getTabDialogBox`, so `ContentDispatchChooser._openDialog` falls back to `Services.ww.openWindow(..., "chrome,dialog=yes,centerscreen")` (`ContentDispatchChooser.sys.mjs:368-391`). That is a standalone chrome window, raised by an agent page's link to `mailto:`, `zoommtg:` and similar schemes. It can take focus, and the focus guard does not cover it. Worse, protocol permissions are not isolated by container (`permissions.isolateBy.userContext` defaults to false). If the user once allowed an origin to open a scheme whose handler is set not to ask, an agent page of that origin launches the external application with an agent-chosen URI and no dialog at all (`ContentDispatchChooser.sys.mjs:74-90`). The owner should decide whether agent overlays refuse external-protocol loads outright. The refusal could be chrome-side, where the agent child or a load observer sees the scheme.
4. **T-66-08-04 (accepted risk) judged acceptable, with one recorded limit.** `CanSet(IDX_SandboxFlags)` accepts any process (`BrowsingContext.h:1601-1603`), and `ContentParent::CommonCreateWindow` does not re-check the opener's flags for OPEN_NEWWINDOW. A compromised agent-container content process could therefore open a featured popup. That requires a renderer compromise. Fission places agent-container pages in their own processes, because the process key carries the origin attributes. A compromised content process has broader IPC options than this one, and Gecko's own iframe sandbox has the same trust assumption. The chrome wall still covers every receiver chrome owns. If the owner wants defense in depth without a Gecko patch, chrome could observe new top-level windows (`domwindowopened`) whose opener browsing context's top embedder is an agent overlay and close them.
5. **Carried (Info):** an agent can raise prompts it cannot answer (file picker, permission doorhanger). The agent container is a public contextual identity. Agent visits enter Places history. Agent overlays are visible to installed extensions through the tab host (pre-existing design).
6. **Holds:** agent control of non-agent tabs, stock tabs, HTTP auth and focus is refused or guarded. The five receivers refuse agent openers. Video PiP is unreachable. The remote-debugging port is closed in shipped launches.

### Deferred Human Verification (end-of-milestone pass, 59-CONTEXT D-18)

These items are carried, not gaps:

1. Mark and Stop are readable and correctly placed (visual, light and dark themes).
2. A live agent session in a real worktree while the user types elsewhere.
3. Copy review: `chrome-bar-copy.ts:77-80` and `privacy.html:86` (re-read after Gap 1).
4. Owner table: S2 over S1, P66-08, P66-11, P66-22, P66-24, P66-26, O1, O2, Places history, D-35's popup revisit, external protocols (finding 3, corrected above), and T-66-08-04.

### Gaps Summary

66-08 did what its plan said. Every new-window receiver chrome owns refuses an agent opener, the popup-with-features route meets the content wall, and the tab-scope derivation goes red on a dropped guard or an unguarded new member. The live run shows zero tabs, windows and loads from an agent page after positive user-side detectors. Phase 67's merge left that code untouched. The phase's four roadmap criteria hold, and agent control still reaches only Orca-created tabs.

D-35's stated rule is "every open path, nothing sent to a stock window". One path still contradicts it: a download started by an agent page opens its viewer through Gecko's download UI helper, which goes straight to a stock browser window and never consults the shell's receivers. The derived check cannot see this path, because it enumerates only the receivers. The fix is local, a download-source check for agent overlays plus one live clause. Gap 2 is a single live probe of the initial `about:blank`. It needs a guard only if the probe opens a window.

No later phase in this milestone covers either gap: Phase 67 is hosting hardening and Phase 68 is artifacts and re-pin.

---

_Verified: 2026-11-11T20:41:43Z_
_Verifier: Claude (gsd-verifier)_
