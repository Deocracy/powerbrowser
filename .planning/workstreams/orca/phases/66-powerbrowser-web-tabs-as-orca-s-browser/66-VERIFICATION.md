---
phase: 66-powerbrowser-web-tabs-as-orca-s-browser
verified: 2026-11-11T12:00:00Z
status: gaps_found
score: 11/12 must-haves verified
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
  - "orca-overlay/files/src/renderer/src/pb/browser-host/pb-browser-host-link.ts"
  - "orca-overlay/files/src/renderer/src/pb/browser-host/pb-browser-host.ts"
  - "orca-overlay/files/src/renderer/src/pb/pb-pane-mount.tsx"
  - "orca-overlay/seams.json"
  - "powerbrowser/INTERNAL-APIS.md"
  - "powerbrowser/shell/GroupActorChild.sys.mjs"
  - "powerbrowser/shell/PowerBrowserAPI.sys.mjs"
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
covered_digest: "v3:sha256:e97efbb410aadd1f4f2c242ac257f0c093c2d0efbfd9de55fd30596d5bc959b1"
behavior_unverified: 0
overrides_applied: 0
gaps:
  - truth: "Pages an agent tab opens (window.open, target=_blank, a middle-click or Enter on a link) stay inside the agent isolation: Orca-agent container, no login manager or autocomplete popup, background placement, and the agent mark/Stop"
    status: failed
    reason: >-
      The Phase 36 new-window adopt paths do not check whether the opener is an agent overlay. adoptContentWindow
      and adoptLinkIn hand every opener's new window to createPendingOverlay, which calls webTabOpen in its pending
      mode with agent left at false. The overlay therefore gets the stock attribute literal: messagemanagergroup
      "browsers" (so Gecko's LoginManager actor attaches) and autocompletepopup "PopupAutoComplete". On the
      link-click path (adoptLinkIn) openWindowInfo is null and no usercontextid is set, so the new tab loads in the
      user's default cookie jar; ClickHandlerParent's params.userContextId is ignored. On the window.open path the
      popup keeps an opener relationship with the agent page, so a same-origin popup is scriptable from the agent's
      browser.eval. Saved logins are not partitioned by container, so a popup to a login page of the agent page's
      origin can be autofilled and read back by the agent. The adopted tab is a non-agent tab, so it carries no mark
      and Stop does not cover it. A foreground popup is activated (web-tab.ts:1758), which moves the user's view.
      The agent child's input rows produce trusted events (synthesizeMouseEvent, nsITextInputProcessor), which give
      the transient user activation that window.open and link opens require. ClickHandler is registered with no
      messageManagerGroups (upstream/browser/components/DesktopActorRegistry.sys.mjs:361-373), so it also attaches
      to agent overlays. No check covers this: orca-browser-agent-live clauses (e), (e2) and (l) read the agent tab
      only, and no clause opens a window from an agent tab. The privacy paragraph (website-staging/privacy.html:86)
      states "An agent never reaches your other tabs or your browser windows" and "your saved passwords are not
      filled into them". Whether each path works end to end (popup blocking, autofill timing, the triggering
      principal of a container-6 page loading into container 0) is not proven live. The missing guard, however, is
      visible in the code.
    artifacts:
      - path: "powerbrowser/shell/PowerBrowserAPI.sys.mjs:7440-7475"
        issue: "adoptLinkIn: checks only that the opener is an overlay (tabIdOfBrowser), never entry.agent; passes openWindowInfo null and ignores params.userContextId; where 'window' goes to openStockTab (the user's stock window and jar)"
      - path: "powerbrowser/shell/PowerBrowserAPI.sys.mjs:7478-7489"
        issue: "adoptContentWindow: same opener check only; an agent page's window.open becomes a pending ordinary overlay"
      - path: "powerbrowser/shell/PowerBrowserAPI.sys.mjs:7492-7499"
        issue: "createPendingOverlay calls webTabOpen(..., pending) with agent defaulting to false"
      - path: "powerbrowser/shell/PowerBrowserAPI.sys.mjs:3611-3618"
        issue: "the non-agent literal sets messagemanagergroup 'browsers' and autocompletepopup 'PopupAutoComplete'; the agent override applies only when agent === true"
      - path: "theia/extensions/tab-uris/src/browser/web-tab.ts:1755-1759"
        issue: "adopt() activates a non-background adopted tab, so an agent-opened popup takes the user's view"
      - path: "website-staging/privacy.html:86"
        issue: "the privacy statement does not hold for agent-opened windows until this is closed"
    missing:
      - "In adoptContentWindow and adoptLinkIn, when the opener overlay's entry has agent === true: either refuse the open (return null for the window.open path only after confirming the stock fallback does not open it either; open nothing on the link path), or create the new overlay as an agent overlay (the agent container, AGENT_MESSAGE_MANAGER_GROUP, empty autocompletepopup, background, agentTabCreated). The agent never takes the stock-window route (where 'window', or a null return that makes Gecko open BROWSER_CHROME_URL)"
      - "A non-adopted window.open from an agent page (popup features, which go to nsWindowWatcher and a stock window) handled the same way. Gecko opens a stock window when browserDOMWindow returns null, so refusing has to stop the open, not divert it"
      - "orca-browser-tab-scope clauses (stub boundary) for an agent opener on both adopt paths, with plants that drop the guard. An orca-browser-agent-live clause that first proves window.open and a middle-click open a tab from a user tab (positive read), then requires that the same open from an agent tab yields no LoginManager actor, no user-jar cookie and no non-agent tab, and does not change the current main-area widget"
      - "Re-read the privacy paragraph against the result"
deferred: []
---

# Phase 66: PowerBrowser web tabs as Orca's browser Verification Report

**Phase Goal:** Orca's agents and the user browse in PowerBrowser web tabs with PowerBrowser chrome. Agent control reaches only Orca-created tabs, and the user can see it and stop it.
**Verified:** 2026-11-11
**Status:** gaps_found
**Re-verification:** No (initial verification)

## Method

- I read the delivered code. SUMMARY claims were not taken as evidence. The code read: the chrome bridge end-of-file section and the `webTabOpen` agent branch of `PowerBrowserAPI.sys.mjs`, the `PowerBrowserAgentChild` in `GroupActorChild.sys.mjs`, `@powerbrowser/orca-browser` (dispatch, page table, reveal tracker, frontend module), the agent pieces of `web-tab.ts`, the chrome-bar mark and copy, the D-34 store-row functions in `pb-pane-mount.tsx`, the row wiring in `pb-browser-host.ts`, the orca-panes `browser` route, and the Phase 36 new-window adopt section.
- I ran 22 quick rows one at a time under `nix develop .#theia`, plus `diff-theia-core.sh`. Every row passed (table below).
- I did not run any live rows or builds, because Phase 67 lanes are running on this host. Live behaviour rests on the coordinator's own output files in `.mozbuild/p66-06/` and `.mozbuild/p66-07/`. I read those files directly; they are raw run output, not SUMMARY narration.

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | SC1: a browser page Orca or an agent opens is a PB web tab with PB's chrome bar, address field and history. A derived check proves each Orca browser-pane entry point routes to a PB web tab, and the screencast pane is never shown | VERIFIED | `orca-pane-routes.ts:41` `'browser': { target: 'pb-web-tab' }`. The observer (`orca-pane-observer.ts:237`) activates only what `OrcaBrowserPages.reveal` returns and creates nothing. `createPage` opens a `WebTabWidget` through `openAgentTab` (`orca-browser-frontend-module.ts:282-291`), so the tab gets the standard chrome bar. I ran `orca-browser-entry-points`: PASS, "the pane entry's graph (8666 modules) reaches none of the 13 page-mounting components; browser routes to pb-web-tab; callers 17 createBrowserTab, 4 createWebRuntimeSessionBrowserTab: 13 reachable, 8 dead". Its self-test PASS. Live: `.mozbuild/p66-07/agent-live-2.txt` clauses (k), (a), (g) and (j) "reveal 16 ms" |
| 2 | SC2: an agent navigates, clicks, types and screenshots through the chrome-side bridge. A request for a non-Orca tab is refused. No WebDriver BiDi port listens, and the check's control run proves the detector | VERIFIED | `handleWebTabAgent` (`PowerBrowserAPI.sys.mjs:11632-11673`) refuses in order: malformed id, a method outside the frozen `AGENT_METHODS`, params failing the method's validator, then the wall. Native rows run in chrome, actor rows through `getActor` only after the wall. The page table refuses unmapped ids with `browser_tab_not_found` (`orca-browser-dispatch.ts:144-147`). I ran `orca-browser-tab-scope`: PASS, "40 methods (15 native, 25 actor): every one refused before page work for a user, unknown, foreign, wrong-container or stopped tab"; its self-test PASS. Live: agent-live-2 (b), (b1), (b2), (d). `.mozbuild/p66-06/final-no-remote-agent-port-live.txt`: the control run saw `127.0.0.1:36851 pid 188786 powerbrowser unaccounted`, and the shipped launch had 4 sockets, each accounted for |
| 3 | SC3: while an agent drives a tab, the chrome bar shows the "agent is controlling" mark with a Stop button, and Stop ends control. A stock window shows no mark | VERIFIED | Chrome owns the state: `agentSetActive`/`agentArmIdle` (20 s), push `agentControlChanged`. `renderAgentControl` (`chrome-bar-widget.tsx:1682-1695`) renders only when `currentWebTab()?.agentControl.active`, and the Stop click is the one caller of `agentStop()`. `handleWebTabAgentStop` sets `stopped` for the tab's lifetime and aborts in-flight calls. The wall then answers `agent-stopped`, which maps to `browser_owner_unavailable`. Live: `.mozbuild/p66-07/orca-agent-mark-live.txt` PASS, "mark and title class while driving, cleared after 21000 ms idle, Stop ended control ... stock window unmarked with chrome equal to the baseline (286 nodes)". The positive read comes before the absence |
| 4 | SC4: each user-facing tool in the Phase 61 inventory is reachable from the chrome bar or a side panel, and a set comparison proves it | VERIFIED | I ran `orca-browser-tools`: PASS, "30 U-rows equal the map's 30 entries: 15 existing contributions, 1 mark, 10 skips, 4 deferrals". Its self-test PASS. The skips are the spike's own dispositions. Deferrals U-06/U-07/U-08/U-12 point at BRW-06..BRW-08, which REQUIREMENTS.md placed in v2 when the milestone was defined (commit 8faee780, 2026-11-04, owner D-3/D-4/D-6), so this is not a phase-level descope. Owner confirmation of P66-24 is in the deferred human items |
| 5 | Chrome wall: only an overlay this frontend created with the agent flag, in its own container and not stopped, accepts agent kinds. Stock-window tabs are unreachable by construction | VERIFIED | `agentWallVerdict` (`:11190-11201`) requires `entry.owner === actorRef`, `entry.agent === true` and `agentInOwnContainer` (the live `originAttributes.userContextId` equals the creation id, `:11206-11209`), and not stopped. The flag is set only after a new overlay is created (`:3652-3655`). The `already-open` return at `:3580-3584` comes first, and `handleGroupMutation` refuses any flag value other than `true` (`:2795-2798`). Lookups read only `webTabs`; stock windows' tabs are never in it |
| 6 | Agent overlay isolation: Orca-agent container, no LoginManager, no autocomplete, dialog answering limited to alert/confirm/prompt, HTTP auth and beforeunload refused, permission prompts and file pickers unanswerable | VERIFIED (for the agent overlay itself) | The attribute override at `:3618` (usercontextid, `messagemanagergroup: powerbrowser-orca-agent`, empty `autocompletepopup`) is set before `appendChild`. Without a container no tab opens (`:3586-3589`). Cookie rows use `{ userContextId: entry.agentUserContextId }` only. `AGENT_DIALOG_TYPES` = alert, alertCheck, confirm, confirmCheck, prompt; `inPermitUnload` is refused; the dialog must belong to this overlay (`agentDialogWindow`). There is no code path that answers permission doorhangers or file pickers. Live: agent-live-2 (e), (e2) "userContextId 6", (l), (m) "promptUserAndPass". This truth covers the agent overlay only; truth 8 covers windows the agent page opens |
| 7 | Agent tabs open in the background and never take the user's focus; a parked overlay that receives focus gives it back | VERIFIED | `openAgentTab` with the placement ref and no activation. `webTabPlacement` parks unshown agent overlays at z-index -1. The capture-phase focus guard (`agentFocusGuardInstall`/`agentFocusGuard`, `:11268-11286`) returns focus to the shown overlay or the Theia frame. Live: agent-live-2 (a), (c), (c2) "typing kept while the parked page called focus()" |
| 8 | Pages an agent tab opens stay inside the agent isolation (container, no login manager, background, marked) | FAILED | See Gaps. `adoptContentWindow`/`adoptLinkIn` (`:7440-7489`) never consult `entry.agent`. `createPendingOverlay` (`:7499`) opens an ordinary overlay with messagemanagergroup "browsers" and PopupAutoComplete. The link path uses the user's default jar |
| 9 | The remote-debugging port is never open in a shipped launch | VERIFIED | No shipped config (powerbrowser/, generated/, flatpak/, homebrew-tap/, winget/, systemd/, nix/, brand/, configuration.toml) names `--remote-debugging-port`, `remote.active-protocols` or marionette. Product code imports no `remote/` module; the only mention is a comment at `:940`. The live row enumerates `/proc/net/tcp*` for the process tree and is blind-proofed by the control run (row 2 evidence). The flag stays available to someone who launches the binary by hand, which is outside the shipped launch |
| 10 | Seams are only 010, 070 and 080; there is no Theia core edit and no edit to a file tracked in Orca's git | VERIFIED | `orca-overlay/seams.json` lists exactly 010, 070 and 080. No phase-66 commit touches `orca-overlay/patches` or `seams.json` (`git log 5a13abab..HEAD`). I ran `orca-overlay`: PASS, 3 seams. I ran `diff-theia-core.sh`: "PASS -- zero changes inside @theia/*". The phase's Theia changes outside `extensions/` are the build order and one dependency line. Live `orca-browser-host-bundle` (p66-07): PASS, including the `git -C orca status` clause |
| 11 | Firefox internals are reached only through the boundary file plus catalogued GroupActorChild rows (hard rule 2) | VERIFIED | The 3 `Cc[`/`Ci.` lines in `GroupActorChild.sys.mjs` (:293, :651, :652) and the `wrappedJSObject` uses (:373, :654) each have a row (`INTERNAL-APIS.md:443-447`). `registerAgentActor` and the child class are at :421-422. I ran `internals-boundary`, `internals-catalogue` and `ng-040-internals-catalogue-lines`: all PASS. No `.sys.mjs` file was added |
| 12 | D-34: each agent page has a background Orca store row keyed by browserPageId; selecting the row reveals the bound tab with no second widget; the row is dropped on closePage or a user close | VERIFIED | `addBrowserPage`/`removeBrowserPage`/`selectBrowserPage` (`pb-pane-mount.tsx:730-772`) use Orca's builders with `activate: false` and a staged client-hosted handle. `followRow` in `pb-browser-host.ts:80-92` adds or drops the row only on a completed command. The reveal tracker's creation mark ends at the first listed record (`orca-browser-dispatch.ts:194-221`). I ran `orca-browser-abilities`: PASS, trace scenario green. `orca-browser-entry-points` clause 10 is part of its PASS. Live: (j) "reveal 16 ms" |

**Score:** 11/12 truths verified (0 present, behavior-unverified)

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `powerbrowser/shell/PowerBrowserAPI.sys.mjs` (agent section :11088-11714, webTabOpen :3575-3660) | wall, 40 methods, container, parking, focus guard, dialogs, mark state, Stop | VERIFIED | Substantive and wired: the `webTabAgent`/`webTabAgentStop` arms are at :5588 |
| `powerbrowser/shell/GroupActorChild.sys.mjs` (`PowerBrowserAgentChild` :639, snapshot after) | 25 actor rows plus snapshot | VERIFIED | Created only through `getActor` after the wall; registered for the agent group only |
| `theia/extensions/orca-browser/**` | page table, dispatch, reveal tracker, abilities, tools | VERIFIED | Listed in `theia/applications/browser/package.json` and `build:extensions` |
| `theia/extensions/tab-uris/src/browser/web-tab.ts` | agent option, push, kinds, Stop | VERIFIED | The flag goes on the first `webTabOpen` only (:984-986) |
| `theia/extensions/chrome-bar/src/browser/chrome-bar-widget.tsx`, `chrome-bar-copy.ts` | mark and Stop, copy rows | VERIFIED | Rendered at :1909. The copy carries no internal identifier (`shell-error-copy-no-internals` PASS) |
| `orca-overlay/files/src/renderer/src/pb/browser-host/*`, `pb-pane-mount.tsx` | thin host, store rows | VERIFIED | Imports no `web-runtime-client` and writes no capability constant (grep: 0) |

### Key Link Verification

| From | To | Via | Status |
|------|----|-----|--------|
| pb-browser-host (Orca attach stream) | OrcaBrowserHost.serve | `onCommand` → `dispatchCommand` | WIRED |
| dispatch automation | chrome `handleWebTabAgent` | `channel.request({kind:'webTabAgent'})` | WIRED |
| chrome actor rows | PowerBrowserAgentChild | `getActor(AGENT_ACTOR_NAME).sendQuery("PowerBrowserAgent:Run")` | WIRED |
| chrome mark state | chrome bar | `agentControlChanged` push → `setAgentControl` → `renderAgentControl` | WIRED |
| Stop button | chrome Stop | `agentStop()` → `webTabAgentStop` | WIRED |
| Orca store row selection | web tab reveal | orca-panes observer → `OrcaBrowserPages.reveal` → `activateWidget` | WIRED |
| completed createPage/closePage | Orca store row | `followRow` → `addBrowserPage`/`removeBrowserPage` | WIRED |

### Behavioral Spot-Checks (run by this verifier, quick rows only)

| Row | Result |
|-----|--------|
| orca-browser-host-bundle-self-test | PASS |
| orca-browser-abilities / -self-test | PASS / PASS |
| orca-browser-entry-points / -self-test | PASS / PASS |
| orca-browser-tab-scope / -self-test | PASS / PASS |
| orca-snapshot-fixtures, orca-browser-snapshot-live-self-test | PASS, PASS |
| orca-browser-tools / -self-test | PASS / PASS |
| orca-browser-agent-live-self-test, orca-agent-mark-live-self-test | PASS, PASS |
| gui02-web-tab-bridge / -self-test | PASS / PASS |
| internals-boundary, internals-catalogue, ng-040-internals-catalogue-lines | PASS |
| orca-overlay | PASS (3 seams: 010, 070, 080) |
| privacy-hosts, shell-error-copy-no-internals | PASS |
| scripts/diff-theia-core.sh | PASS, zero changes inside @theia/* |

### Can the checks go red?

- `orca-browser-tab-scope` evaluates the shipped section in `node:vm` over a stub boundary. Its self-test plants a missing wall arm, a flag honoured on an existing tab, a duplicate-accepting table, a wrong container and a missing Stop, and each goes red. This derives from the shipped source rather than from a copy.
- `orca-browser-abilities` makes a three-way set comparison: the pinned Orca tier-1 set, chrome's `AGENT_METHODS` parsed from source, and the dispatcher's served set. Plants include an extra method, a missing method on each side, a BiDi row and an empty derivation.
- `orca-browser-entry-points` derives the page-mounting components and the `createBrowserTab` callers with TypeScript from the pin. Plants include a new component, an imported screencast pane and a zero-member parse. 66-07 added 12 plants for the store-row clause.
- `orca-browser-tools` makes a set comparison of the U-rows parsed from the spike README against the map, and requires each contribution to exist in the tree.
- `no-remote-agent-port-live` runs a control launch with `--remote-debugging-port=0`, which must show an unaccounted main-process socket before the shipped launch is judged. The ports it accepts are derived at run time (orcad's agent-hook port is read from Orca's `endpoint.env`).
- `orca-agent-mark-live` proves the mark present before it judges the stock window unmarked. `orca-browser-agent-live` (l) proves login autofill in a user tab before it judges the agent tab empty, and (j) requires the user tab current before the create.
- Not covered: no check opens a window from an agent tab (Gap 1).

### Requirements Coverage

| Requirement | Source Plans | Status | Evidence |
|-------------|--------------|--------|----------|
| BRW-02 | 66-01, 66-02, 66-05, 66-07 | SATISFIED | Truths 1, 12 |
| BRW-03 | 66-01..66-04, 66-07 | SATISFIED for the bridge; the security gap is in Gap 1 | Truths 2, 5, 6, 9. "can reach only Orca-created tabs" holds for agent control. Agent-opened windows leave the isolation (Truth 8) |
| BRW-04 | 66-03, 66-05 | SATISFIED | Truth 3 |
| BRW-05 | 66-05 | SATISFIED | Truth 4 |

No orphaned requirement: REQUIREMENTS.md maps only BRW-02..BRW-05 to Phase 66, and each appears in a plan.

### Prohibitions (judgment tier; non-authoritative LLM-judge verdicts)

| Prohibition | Verdict |
|-------------|---------|
| No `web-runtime-client` import, no Orca constant write, no private member (66-01) | Holds: grep over `pb/browser-host/` found 0. The host-bundle static clauses are green |
| No seam patch, no tracked Orca edit, seams.json untouched (66-01) | Holds: no phase-66 commit touches either |
| No pairing material in logs/results (66-01) | Holds for the p66-07 evidence files I read. The one "pairing" match is the word in a PASS line |
| No Orca browser component mounted (66-02) | Holds: entry-points PASS |
| No WebDriver BiDi / Remote Agent module in product code (66-03) | Holds: grep found 0 imports |
| No accessibility service in the child (66-04) | Holds: grep found 0 |
| No custom browser chrome beyond the chrome bar (66-05) | Holds: one mark element and one Stop button inside the existing bar |
| Coordinator process prohibitions (66-06, 66-07) | Not independently re-derivable; accepted on the merge records |

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| PowerBrowserAPI.sys.mjs | 11348-11349 | `shortcut:` comment on navigation settle polling | Info | Documented limit with an upgrade trigger; not a debt marker |
| — | — | TBD/FIXME/XXX in phase files | none found | — |

### Security Findings

1. **Blocker (Gap 1): agent-opened windows leave the agent isolation.** Details are in the gaps frontmatter. Two consequences follow from the code alone. First, a link opened from an agent tab by a middle-click (or Enter on a focused link, which takes modifiers through nsTextInputProcessor) becomes a non-agent PB web tab in the user's default jar with the login manager attached. Second, a `window.open` from an agent page becomes a non-agent tab with the login manager attached, scriptable by the agent page when same-origin. Exploitability end to end is not proven live.
2. **Info: an agent can raise prompts it cannot answer.** A trusted synthesized click on `<input type=file>` or a permission request makes Gecko show a file picker or doorhanger to the user. The agent has no path to answer it (`agentAnswerDialog` reads only this overlay's commonDialog windows, and only alert/confirm/prompt), but the user may be asked to act on an agent's behalf. Record this for the owner.
3. **Info: the agent container is a public contextual identity.** "PowerBrowser Orca agents" is visible wherever containers are listed. A user could open a stock tab in it and share the agent's cookies. The id is kept in the user pref `powerbrowser.orca.agentUserContextId` and re-validated at each use.
4. **Info, recorded earlier as an owner item:** agent-tab visits enter the user's Places history (66-06 Deferred).
5. **Holds:** agent control of a non-agent tab, of a stock-window tab, of the HTTP-auth dialog or of the user's focus is refused or guarded in code and proven live (truths 5-7). The remote-debugging port is never open in a shipped launch (truth 9).

### Deferred Human Verification (end-of-milestone pass, 59-CONTEXT D-18)

These are not gaps. They go to the single end-of-milestone owner pass.

1. **Mark and Stop are readable and placed correctly.** Test: drive a tab with the CLI and look at the chrome bar and the tab title in light and dark themes. Expected: the mark beside the sharing indicator, a clear Stop button, and the title class visible. Why human: visual.
2. **Live agent session.** Test: in a real worktree, an Orca agent browses, fills a form and takes a screenshot while the user types in another tab. Expected: no focus loss, and the result is correct. Why human: needs a live agent login.
3. **Copy review.** Review the four mark/Stop strings in `chrome-bar-copy.ts:77-80` and the privacy paragraph (`privacy.html:86`, to be re-read after Gap 1). Why human: owner copy.
4. **Owner table.** S2 over S1, P66-08, P66-11, P66-22, P66-24 (U-06/U-07/U-08/U-12 deferred to v2), P66-26, and O1 (parked timer throttling), O2 (agent page dialogs block the IDE) and Places history. Why human: auto-mode picks the owner may override.

### Gaps Summary

All four roadmap criteria are met in the code, and the coordinator's live output supports each of them. Agent control is walled twice (the page table, then the chrome flag, owner and container check), and Stop and the mark work. One security truth fails: the Phase 36 new-window adopt paths do not know about agent overlays. A page an agent drives can therefore open a window or a tab that is an ordinary user tab: it has the login manager, sometimes uses the user's cookie jar, and carries no mark. In the `window.open` case the agent page can still script it. This contradicts P66-26's intent and the shipped privacy paragraph. The fix is local: an `entry.agent` check on the opener in `adoptContentWindow`/`adoptLinkIn` and on the nsWindowWatcher popup path, plus tab-scope plants and one live clause. No later phase in this milestone covers it (Phase 67 is failure pages, pairing containment, the Origin check, the credential-storage refusal and the logo), so it is not deferred.

---

_Verified: 2026-11-11_
_Verifier: Claude (gsd-verifier)_
