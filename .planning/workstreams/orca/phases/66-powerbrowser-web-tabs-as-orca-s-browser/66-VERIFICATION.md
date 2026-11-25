---
phase: 66-powerbrowser-web-tabs-as-orca-s-browser
verified: 2026-11-11T22:44:11Z
status: human_needed
score: 25/25 must-haves verified
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
  - ".planning/workstreams/orca/phases/66-powerbrowser-web-tabs-as-orca-s-browser/66-09-PLAN.md"
  - ".planning/workstreams/orca/phases/66-powerbrowser-web-tabs-as-orca-s-browser/66-09-SUMMARY.md"
  - "inventory/brand-tokens.json"
  - "orca-overlay/files/src/renderer/src/pb/browser-host/pb-browser-host-link.ts"
  - "orca-overlay/files/src/renderer/src/pb/browser-host/pb-browser-host.ts"
  - "orca-overlay/files/src/renderer/src/pb/pb-pane-mount.tsx"
  - "orca-overlay/seams.json"
  - "powerbrowser/INTERNAL-APIS.md"
  - "powerbrowser/shell/GroupActorChild.sys.mjs"
  - "powerbrowser/shell/OrcaEnv.sys.mjs"
  - "powerbrowser/shell/PowerBrowserAPI.sys.mjs"
  - "powerbrowser/shell/powerbrowser.js"
  - "scripts/lib/orca-browser-live.mjs"
  - "scripts/lib/pb-live-probe.mjs"
  - "scripts/verify-no-remote-agent-port-live.mjs"
  - "scripts/verify-orca-agent-mark-live.mjs"
  - "scripts/verify-orca-browser-abilities.mjs"
  - "scripts/verify-orca-browser-agent-live.mjs"
  - "scripts/verify-orca-browser-entry-points.mjs"
  - "scripts/verify-orca-browser-tab-scope.mjs"
  - "scripts/verify-orca-browser-tools.mjs"
  - "scripts/verify-orca-failure-page-live.mjs"
  - "scripts/verify-orca-landing-selectors.mjs"
  - "scripts/verify-platform.sh"
  - "scripts/verify-shell-request-kinds.mjs"
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
covered_digest: "v3:sha256:2259ca709db9e05bf5bb5498b5c3767995ff568e246b0799f0f4033d83be3838"
behavior_unverified: 0
overrides_applied: 0
re_verification:
  previous_status: gaps_found
  previous_score: 16/18
  gaps_closed:
    - "Pages an agent tab opens stay inside the agent isolation: a download from an agent page is refused (SANDBOXED_DOWNLOADS), so no file, no download row and no viewer in a stock window (66-09, D-37)"
    - "Content wall on the initial about:blank: every agent command but browser.goto is refused while the overlay's current document is its initial document (66-09, D-37)"
    - "Security finding 3 (external protocols): an agent overlay's external-protocol load raises no dialog and launches nothing; the user's own loads go to Gecko's chooser unchanged (66-09, D-37)"
  gaps_remaining: []
  regressions: []
gaps: []
deferred: []
human_verification:
  - test: "Owner decision: agent-page clipboard writes. An agent click gives the page transient activation, and with it navigator.clipboard.writeText and execCommand('copy') write the system clipboard (nsContentUtils.cpp:8450-8457, no focus requirement). A page can replace the user's clipboard while its tab is parked, for example with a command the user then pastes into an Orca terminal. An agent browser.press of Control+v also pastes the user's clipboard into the page (GroupActorChild.sys.mjs:318-334)."
    expected: "The owner rules either: refuse (for example a clipboard-write refusal for agent overlays, or a paste-key refusal in the agent child), or accept and add the clipboard to D-37's record and the privacy paragraph"
    why_human: "No ruling (D-35, D-37) or roadmap criterion covers the clipboard. It is a policy choice, not a code defect against a stated rule"
  - test: "Owner decision: site permissions are shared across containers (permissions.isolateBy.userContext defaults false, StaticPrefList.yaml:16999-17002; PermissionManager.cpp:172). A permission the user granted an origin (notifications, geolocation, camera or microphone with 'Remember') is used silently by an agent page of that origin, and a permission the user grants in an agent tab applies to the user's own tabs. With notification permission, an agent-container service worker can show a desktop notification; the user's click on it can open a page in a stock window in the agent container through clients.openWindow (ClientOpenWindowUtils.cpp:229-232, :262, :284-317), a route that bypasses D-35's receivers"
    expected: "The owner rules either: accept (each case needs a grant the user made, and the open needs the user's click), or refuse permission-gated capabilities for agent overlays (for example a chrome-side refusal of permission requests from the agent container, or the isolateBy pref with its effect on user containers)"
    why_human: "A product decision about container scope that no ruling records"
  - test: "Deferred (end-of-milestone pass, 59-CONTEXT D-18): mark and Stop are readable and correctly placed in light and dark themes"
    expected: "The mark and Stop button are legible and placed as in the UI contract"
    why_human: "Visual"
  - test: "Deferred: a live agent session in a real worktree while the user types elsewhere"
    expected: "No focus theft, no lost keystrokes, the mark shows on the agent tab only"
    why_human: "Real-time interaction"
  - test: "Deferred: copy review of chrome-bar-copy.ts:77-80 and privacy.html:87 against D-37 (downloads and protocol launches are now refused; the clipboard and shared-permission rulings above may need a sentence)"
    expected: "Copy matches behavior"
    why_human: "Copy judgment"
  - test: "Deferred owner table: S2 over S1, P66-08, P66-11, P66-22, P66-24, P66-26, O1, O2, Places history, D-35's popup revisit, D-37's owner items (agent downloads, mailto hand-off), T-66-08-04, T-66-09-04, the agent container visible in the stock window's container UI, the native file picker an agent click can raise"
    expected: "Each row ruled"
    why_human: "Owner decisions"
audit_acknowledged:
  milestone: v1.7
  at: 2026-11-25
  status: human_needed
---

# Phase 66: PowerBrowser web tabs as Orca's browser Verification Report

**Phase Goal:** Orca's agents and the user browse in PowerBrowser web tabs with PowerBrowser chrome. Agent control reaches only Orca-created tabs, and the user can see it and stop it.
**Verified:** 2026-11-11T22:44:11Z
**Status:** human_needed
**Re-verification:** Yes. The previous one followed 66-08 and Phase 67's merge. This one follows gap closure 66-09 (D-37), merged at 2c713811, and the three later commits on the integration branch

## What changed since the previous verification (2026-11-11T20:41:43Z, gaps_found, 16/18)

- **Gap 1 (downloads) is closed.** `agentTabCreated` writes `SANDBOXED_AUXILIARY_NAVIGATION | SANDBOXED_DOWNLOADS` in one statement (`PowerBrowserAPI.sys.mjs:11273`), and `SANDBOXED_DOWNLOADS = 0x10000` (:11297) matches `nsSandboxFlags.h:121`. The pinned `ClassifyDownload` reads both the load's and the triggering document's sandbox flags (`nsContentSecurityUtils.cpp:2242-2248`), and `nsExternalAppHandler` cancels a forbidden download with `NS_ERROR_ABORT` before any file, row or viewer exists (`nsExternalHelperAppService.cpp:1638-1645`). The `http-on-stop-request` arm (:11537, :11549-11554) counts a cancelled agent document channel as a refused "download". Live on the merged tree: clause (o) passed, and the user's own download saved.
- **Gap 2 (initial document) is closed by refusal, not by moving the flag.** `handleWebTabAgent` refuses every method except `browser.goto` while `currentWindowGlobal.isInitialDocument === true` (:11765-11767). The attribute is defined at `WindowGlobalActors.webidl:99`. The guard runs after the wall verdict and before both native and child rows. Live (q): refused, 0 windows, 0 loads, then `done /slow` after the first load. The 66-09 probe on the unmodified tree (`probe-2.txt`) proves the gap existed: `initial:true`, then a click and a featured `window.open` opened `chrome://browser/content/browser.xhtml`.
- **External protocols (Security finding 3) are closed.** Details are in "D-37 chooser" below.
- **Earlier walls are intact.** `git diff 06059cf4 HEAD` on `PowerBrowserAPI.sys.mjs` has 9 hunks, all additive in the agent section except two logo-parent lines (:11955, :11962, `orcaState`). The only removed lines are the old single-flag write (now the two-flag write) and the two logo calls (now with `orcaState`). `GroupActorChild.sys.mjs`, the adopt section and `installNewWindowReceivers` are unchanged. `git -C upstream diff` is empty, and `orca-overlay` passes with 3 seams.
- **The merged tree's live runs are all green** (`.mozbuild/coord-6609/`, 14:10-14:20, after the merge at 14:01): agent-live PASS rc=0 (every clause, including (f), which was red in the lane and was fixed by 238e65d2), agent-mark-live PASS, landing-logo-live PASS, failure-page-live PASS, new-window-adopt-live PASS (12 legs). `quick-1.txt` at 14:33: "verify-platform: PASS -- all checks passed".

### D-37 chooser: checked against the three properties asked for

1. **It refuses agent tabs.** `agentProtocolWallInstall` (:11332-11356) registers a factory for `@mozilla.org/content-dispatch-chooser;1`. That is the contract `LoadURI` creates per allowed external load in the parent (`nsExternalHelperAppService.cpp:1164-1170`; content processes forward through `SendLoadURIExternal`, :1028-1034). Its `handleURI` returns early when `browsingContext?.top?.embedderElement` is an agent overlay (:11343). Using `top` covers frames, including out-of-process frames, because the parent-side `CanonicalBrowsingContext.top` is the overlay's. A sandbox flag cannot do this: `ExternalProtocolIsBlockedBySandbox` returns false for a top-level context (:984-989).
2. **It cannot break the user's own links.** Every other case goes to Gecko's chooser through the stock factory, taken by CID with `getClassObject` before the override (:11338, :11346). A stock-window tab, a user overlay, the Theia frame, or a null browsing context (an OS or chrome-triggered load) all make `tabIdOfBrowser` null (:5616-5626), so `agentOpenRefused` is false (:11303) and the load is delegated. Evidence: the tab-scope `wallsClause` drives the shipped chooser with a user context and with a null context, and requires each to reach the stock chooser exactly once. My scratch plant that refuses a null context went red on that clause. Live (p) user half on the merged tree: mailto launched, pbrun launched, pbask raised 1 dialog. One residual: the override is process-wide and stays installed after the last agent tab closes. It only delegates, so it adds a call layer and nothing else.
3. **It is installed once.** A module-level flag returns early (:11330, :11333-11336). Scratch run against the shipped source: 3 agent tabs registered 1 factory. **Check gap (Info):** with the flag removed, the scratch run registered 3 factories and `wallsClause` stayed green, because the clause opens only one agent tab. Behavior would be unchanged (each layer wraps the previous one, and the outermost refuses), so this is Info, not a gap.

## Method

- I read the agent section (`PowerBrowserAPI.sys.mjs:11190-11400, :11520-11580, :11700-11830`), the PROMPT-01 section (:7588-7740), element fullscreen (:9282-9520), `tabsBridgeCreate` (:10568-10596), and the agent child's input rows (`GroupActorChild.sys.mjs:255-345`).
- Upstream code I read for each candidate path is cited in the tables.
- I ran 22 quick rows one at a time with `scripts/verify-platform.sh --only <label>` inside `nix develop .#theia`. All passed (table below). I confirmed that `--only` fails on an unknown label, so a PASS means the row ran.
- I ran scratch plants against the shipped tab-scope exports (`sliceSource`, `makeWorld`, `wallsClause`) with the pinned upstream files.
- I did no live runs and no builds. The live evidence is the coordinator's raw output in `.mozbuild/coord-6609/` (merged tree) and the lane's raw output in `gap-66-09/.mozbuild/p66-09/` (gap proofs).

## Goal Achievement

### Observable Truths

Truths 1-12 are from the initial verification, and truths 13-18 are 66-08's must-haves. Truths 19-25 are 66-09's must-haves.

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | SC1: Orca/agent browser pages are PB web tabs with PB chrome; entry points derived; no screencast pane | VERIFIED (regression) | `orca-browser-entry-points` PASS today; route files unchanged |
| 2 | SC2: navigate, click, type, screenshot through the chrome bridge; a non-Orca tab is refused; no BiDi port | VERIFIED (regression) | `orca-browser-tab-scope` PASS: 40 methods refused for user, unknown, foreign, wrong-container and stopped tabs. Live (b), (d) on the merged tree |
| 3 | SC3: the agent mark with Stop; Stop ends control; a stock window shows no mark | VERIFIED (regression) | `coord-6609/agent-mark-live.txt` PASS on the merged tree |
| 4 | SC4: every user-facing tool in the inventory is reachable (set comparison) | VERIFIED (regression) | `orca-browser-tools` PASS today |
| 5 | Chrome wall: only an agent overlay this frontend created, in its container, not stopped | VERIFIED (regression) | `agentWallVerdict` :11202-11213 unchanged |
| 6 | Agent overlay isolation (container, no LoginManager, no autocomplete, limited dialogs, HTTP auth refused) | VERIFIED (regression) | Live (e), (e2) container 6, (l), (m) on the merged tree |
| 7 | Background, never takes focus; a parked overlay gives focus back | VERIFIED (regression) | :11359-11379 unchanged. Live (c), (c2) |
| 8 | Pages an agent tab opens stay inside the agent isolation (D-35/D-37: refused on every open path) | VERIFIED (was FAILED) | The receivers (truths 14-17), the content wall (truth 13), downloads (truth 19) and external protocols (truth 20). Live (n), (o), (p), (q) on the merged tree |
| 9 | No remote-debugging port in a shipped launch | VERIFIED (regression) | No shipped config changed |
| 10 | Seams only 010, 070, 080; no Theia core edit; no tracked Orca edit | VERIFIED (regression) | `orca-overlay` PASS (3 seams). 66-09 touches no `orca/`, `upstream/` or Theia file |
| 11 | Firefox internals only through the boundary file plus catalogued rows | VERIFIED | `internals-boundary`, `internals-catalogue`, `ng-040-internals-catalogue-lines` PASS today (8 new rows for the registrar, factory and stop-request touchpoints) |
| 12 | D-34 store rows; reveal; row dropped on close | VERIFIED (regression) | `orca-browser-abilities` PASS. Live (j) reveal 13 ms |
| 13 | Content wall on the agent browsing context from creation; never on a user overlay | VERIFIED (was UNCERTAIN) | Every document after the write carries both flags (live (n) `sandboxFlags 65538` = 0x10002). The initial `about:blank`, which Gecko builds from `InitialSandboxFlags`, is covered by truth 21's command refusal. The page itself runs no script there, because nothing loads before the first commit |
| 14 | Every `installNewWindowReceivers` receiver refuses an agent opener | VERIFIED (regression) | Adopt section unchanged. `new-window-adopt` (+self-test) PASS |
| 15 | A chrome refusal is logged once per tab and path without the URL; the in-flight command fails | VERIFIED | :11301-11314, :11783. `wallsClause` checks once-only logs and no URL for both new paths |
| 16 | tab-scope derives every receiver path, with a plant per path | VERIFIED (regression) | PASS: "5 open paths derived ... 12 OPEN_* locations or 6 link wheres" |
| 17 | agent-live clause (n) | VERIFIED | `coord-6609/agent-live-1.txt`: (n) ok, user detectors first |
| 18 | 66-08 re-runs; nothing pushed | VERIFIED (carried) | As before |
| 19 | D-37 downloads: an agent-overlay download is not saved, listed or opened; a user tab's download still saves | VERIFIED | Code above. Live (o): "user: saved true, 1 row, 0 window; agent: 2 requests, folder 1 -> 1 file(s), rows 1 -> 1, 0 windows, click failed ..., goto failed ...". `wallsClause` requires the bits on the agent load and not on the user load. Scratch plant (bit dropped) went red |
| 20 | D-37 external protocols: no dialog, no launch, also for a granted scheme; user unchanged | VERIFIED | Chooser section above. Live (p): user launches true and 1 dialog; agent 0 launches, 0 windows, three refusals |
| 21 | D-37 first document: only `browser.goto` runs on the initial about:blank | VERIFIED | :11765-11767. `wallsClause` runs every other method with sample params and requires a refusal with zero page work, and requires goto to navigate. Scratch plant (goto also refused) went red. Live (q) |
| 22 | A refused download or protocol launch fails the command; logged once per tab and path without the URL | VERIFIED | `agentSettleOpens` :11740-11744 (100 ms beat, up to 3 s while loading). `wallsClause` fires the cancel after the child's reply and requires failure. Live (o) and (p) replies are `failed browser_command_unavailable` |
| 23 | tab-scope derives the download bits and chooser contract from the pin, drives every registered observer, plant per guard | VERIFIED | PASS today: "SANDBOXED_DOWNLOADS (from the pin) ... @mozilla.org/content-dispatch-chooser;1 chooser (from the pin)". Self-test: 40 plants red |
| 24 | agent-live (o), (p), (q): user detectors first, then the agent side refused | VERIFIED | `coord-6609/agent-live-1.txt` (quoted in rows 19-21). Self-test: 75 plants red |
| 25 | Phase 67 follow-ups: logo needs state ready; failure-page reload barrier (5+ runs); sender-wall plants | VERIFIED | `OrcaEnv.sys.mjs:613` refuses any `orcaState` other than `"ready"`, wired at `PowerBrowserAPI.sys.mjs:11955, :11962`. `verify-orca-failure-page-live.mjs:438-440` checks `timeOrigin`. W47 6/6 counted runs (lane), plus coord PASS. `orca-landing-selectors` and `shell-request-kinds` (+self-tests) PASS today |

**Score:** 25/25 truths verified (0 present, behavior-unverified). The behavior-dependent truths (19-22) have behavioral evidence: the stub-boundary scenarios I ran, and the coordinator's raw live output on the merged tree.

### Remaining paths from an agent page: one more pass

I checked each path for whether an agent page can produce an effect outside its own tab or container.

| Path | Classification | Evidence (file:line) |
|------|----------------|----------------------|
| New window, tab, popup (all receivers, featured popup, print, document PiP) | Closed | Truths 13-17; carried table from the previous pass |
| Download, and its viewer in a stock window | Closed | Truth 19 |
| External protocol (dialog or launch) | Closed | Truth 20 |
| Commands on the initial about:blank | Closed | Truth 21 |
| Service workers, SharedWorkers, BroadcastChannel, localStorage, IndexedDB, Cache shared with user tabs of the same origin | Closed by Gecko's container keying | BroadcastChannel keys on `storagePrincipal->GetOrigin` (with the userContextId suffix), `BroadcastChannel.cpp:361`. SharedWorker matches on the storage principal's attributes, `SharedWorkerManager.cpp:92-103`. Storage and SW registrations are keyed by the origin with its suffix. Live (e2) proves the agent overlay is in container 6 |
| Beacon, `<link rel=prefetch>`, preconnect | Closed (they stay in the agent container) | Requests carry the page's origin attributes, so the cache and connection pool are per container. DNS prefetch is off globally (`firefox-branding.js:141`). A beacon is the page's own network traffic |
| WebRTC (no media) | Accepted risk | Network traffic of the agent page only (mDNS host candidates by default). With media it falls under the permissions row |
| Fullscreen | Closed while parked; stock behavior while shown | `PowerBrowserAPI.sys.mjs:9485` aborts entry unless the overlay is shown to the user in the active window. When the user is looking at the agent tab, the stock warning shows and Esc exits |
| Pointer lock | Closed while parked; stock behavior while shown | `PointerLockManager.cpp:229-240` denies an inactive top context or an unfocused tab. A parked overlay has an inactive docshell, and the focus guard (:11359-11379) keeps focus off it. When shown, the stock warning applies (:9404) |
| Web Share | Closed on the shipped platforms | `dom.webshare.enabled` is false outside early-beta Windows (`StaticPrefList.yaml:6227-6232`) |
| Add-on install from an XPI link the agent clicks | Closed (no prompt surface) | `amContentHandler.sys.mjs:46-76` hands the overlay to `installAddonFromWebpage`. The shell does not port add-on install prompts (`PowerBrowserAPI.sys.mjs:9290-9291`), and stock windows ignore browsers that are not theirs (`browser-addons.js:1269`). Nothing installs |
| Permission prompts (notifications, geolocation, camera/mic, registerProtocolHandler bar) | Accepted risk (carried) | `notifications.show` (:7646-7700) queues a background tab's prompt until the user opens that tab (cap 3 per tab, :7607), so a prompt reaches the user only in the agent tab, and only the user answers |
| **Site permissions shared across containers** | **Gap, owner decision** (not a roadmap criterion) | `permissions.isolateBy.userContext` defaults false (`StaticPrefList.yaml:16999-17002`), and PB does not set it. A grant the user made to an origin is used silently by an agent page of that origin (desktop notifications; geolocation; camera/mic remembered), and the reverse also holds. Notification click to `clients.openWindow` opens a stock window in the agent container (`ClientOpenWindowUtils.cpp:229-232, :262, :284-317`). That route is outside D-35's receivers, but it needs the user's click and a user-made grant |
| **Clipboard write (and agent-driven paste)** | **Gap, owner decision** (no ruling covers it) | `nsContentUtils.cpp:8450-8457`: cut and copy are allowed with transient activation, with no focus check. The agent's trusted clicks (`GroupActorChild.sys.mjs:268-272`) supply activation, so a parked agent page can replace the user's system clipboard. `agentPress` (:318-334) lets `Control+v` paste the user's clipboard into the page. Note that D-12 (skip-permissions) already gives the agent process shell access. The new exposure is the untrusted page writing the clipboard on an agent click |
| File input (native file picker) | Accepted risk (carried, finding 5) | An agent click on `<input type=file>` raises the native picker, modal to the shell window. Only the user can pick a file. Listed in the owner table |
| The agent container selectable by the user | Accepted risk | Containers are a public contextual identity (`PowerBrowserAPI.sys.mjs:11258`), and Firefox's container UI is on by default (`firefox.js:2628-2629`, not overridden). So a stock-window "New Container Tab" can open a tab in "PowerBrowser Orca agents". That tab shares the agent's cookies, but the agent cannot control it (`agentWallVerdict` reads only `webTabs`). Shell overlays refuse a container (`tabsBridgeCreate` :10571-10573). Making the identity private is the option if the owner wants it hidden |
| Autoplaying audio | Accepted risk | Sound from a parked tab. No state change outside the tab |

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `powerbrowser/shell/PowerBrowserAPI.sys.mjs` | `SANDBOXED_DOWNLOADS` in the wall write, `agentProtocolWallInstall`, the stop-request detector, `agentSettleOpens`, the initial-document guard | VERIFIED | :11273, :11297, :11332-11356, :11537/:11549-11554, :11740-11744, :11765-11767; all wired from `agentTabCreated`/`handleWebTabAgent` |
| `scripts/verify-orca-browser-tab-scope.mjs` | `wallsClause` | VERIFIED | :759-849, called from `checkSource` :979 |
| `scripts/verify-orca-browser-agent-live.mjs` | clauses (o), (p), (q), `verdictFirstDocument` | VERIFIED | Self-test 75 plants. Live PASS on the merged tree |
| Earlier artifacts | as before | VERIFIED (regression) | Unchanged except as described |

### Key Link Verification

| From | To | Via | Status |
|------|----|-----|--------|
| `agentTabCreated` | `agentProtocolWallInstall` | call at :11276, once-only flag :11333 | WIRED |
| chooser `handleURI` | `agentOpenRefused(..., "protocol launch")` | :11343 | WIRED |
| `agentNetworkObserver` stop-request arm | `agentOpenRefused(entry.browser, "download")` | :11551 | WIRED |
| `agentOpenRefused` counter | `handleWebTabAgent` | `agentSettleOpens` :11776, compare :11783 | WIRED |
| Earlier links (receivers, wall, mark, Stop, store reveal) | | | WIRED (unchanged) |

### Behavioral Spot-Checks (run by this verifier)

| Row | Result |
|-----|--------|
| orca-browser-tab-scope / -self-test | PASS / PASS (40 plants) |
| orca-browser-agent-live-self-test | PASS (75 plants) |
| internals-boundary, internals-catalogue, ng-040-internals-catalogue-lines | PASS |
| new-window-adopt / -self-test, gui02-web-tab-bridge / -self-test | PASS |
| orca-browser-abilities, orca-browser-entry-points, orca-browser-tools, orca-overlay | PASS |
| shell-request-kinds / -self-test, orca-landing-selectors / -self-test | PASS |
| scan-brand-residue, privacy-hosts, shell-error-copy-no-internals, orca-agent-mark-live-self-test | PASS |
| Scratch plants against `wallsClause` with the pinned upstream files | shipped GREEN (1 factory after 3 agent tabs). Plants RED: download bit dropped, null context refused, goto refused on the initial document. Once-guard removed: 3 factories, clause GREEN (Info above) |

### Probe Execution

66-09 declares no `scripts/*/tests/probe-*.sh`. Live rows were not run (instruction). I read the raw outputs directly: `coord-6609/*.txt` (merged tree) and `p66-09/probe-1.txt`, `probe-2.txt` (the gaps on the unmodified tree).

### Requirements Coverage

| Requirement | Source Plans | Status | Evidence |
|-------------|--------------|--------|----------|
| BRW-02 | 66-01, 66-02, 66-05, 66-07 | SATISFIED | Truths 1, 12 |
| BRW-03 | 66-01..66-04, 66-07, 66-08, 66-09 | SATISFIED | Truths 2, 5, 6, 8, 9, 13-24. The clipboard and shared-permission rows are owner decisions outside the requirement's text |
| BRW-04 | 66-03, 66-05 | SATISFIED | Truth 3 |
| BRW-05 | 66-05 | SATISFIED | Truth 4 |

66-09 also lists INJ-01 and RUN-06 for its Phase 67 follow-ups (truth 25). No orphaned requirement.

### Prohibitions (judgment tier; non-authoritative LLM-judge verdicts)

| Prohibition | Verdict |
|-------------|---------|
| 66-09: no edit to Theia core, `upstream/`, tracked `orca/`, the ledger, brand-tokens, STATE, ROADMAP, REQUIREMENTS or WINDOWS; no new seam | Holds for the lane: the merge 2c713811 touches 13 files, none in those trees. The later integration commit 14e81519 edits WINDOWS, ROADMAP, STATE and brand-tokens. That is the coordinator's merge tracking, outside the lane's prohibition. `git -C upstream diff` is empty |
| 66-09: no token, ready line, pairing URL, offer or saved password in output | Holds for the coord-6609 files I read |
| 66-09: no push, no amend, no stash; explicit-path commits; no check weakened | Push is not independently re-derivable. No check was weakened: tab-scope went from 30 to 40 plants and agent-live from 56 to 75 |
| Earlier prohibitions | Unchanged |

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| PowerBrowserAPI.sys.mjs | 11735 | `shortcut:` on the settle polling (100 ms minimum per child-run command, up to 3 s while loading) | Info | Documented, with an upgrade trigger |
| PowerBrowserAPI.sys.mjs | 11330-11336 | once-only chooser install not covered by a check | Info | Harmless if dropped (behavior unchanged) |
| 66-09 changed files | — | TBD/FIXME/XXX | none found | — |

### Security Findings

1. **Closed:** Gap 1 (downloads), Gap 2 (initial document) and finding 3 (external protocols), as above.
2. **Owner decision: clipboard.** An agent click lets the page write the system clipboard. Agent-driven `Control+v` reads it into the page. No ruling covers this.
3. **Owner decision: shared site permissions.** Grants cross containers in both directions. A notification click can open an agent-container page in a stock window through `clients.openWindow`. Both need a user grant, and the open needs a user click.
4. **Carried, accepted:** T-66-08-04 and T-66-09-04 (a compromised content process can clear its own sandbox flags; the protocol refusal is parent-side and does not depend on them). The file picker. The public agent container. Places history. Extension visibility of agent overlays.

### Gaps Summary

66-09 closes everything the previous verification left open, and the merged tree's live run shows each wall with its user-side detector first. Downloads are cancelled by Gecko before any file or viewer exists. External-protocol loads from agent overlays stop at a parent-side chooser that passes every other load to Gecko's own. Commands on the initial `about:blank` are refused except the goto that replaces it. The earlier walls are byte-identical apart from the combined flag write. All four roadmap criteria hold, and no must-have fails.

The extra pass found two effects outside the agent's tab that no ruling covers: clipboard writes, and site permissions shared across containers. Neither contradicts D-35, D-37 or a roadmap criterion, so they are escalated as owner decisions, not recorded as gaps. The status is human_needed because of those two decisions and the carried end-of-milestone items.

---

_Verified: 2026-11-11T22:44:11Z_
_Verifier: Claude (gsd-verifier)_
