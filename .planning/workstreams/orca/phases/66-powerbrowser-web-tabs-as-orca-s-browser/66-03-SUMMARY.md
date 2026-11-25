---
phase: 66-powerbrowser-web-tabs-as-orca-s-browser
plan: 03
subsystem: chrome bridge (powerbrowser/shell)
status: complete
tags: [orca, agent-bridge, BRW-03, BRW-04, internals-boundary, lane-p66-03]
requires: [Phase 64 merged, Phase 65 merged (65-05)]
provides:
  - "webTabAgent / webTabAgentStop arms and the Orca agent bridge section of PowerBrowserAPI.sys.mjs"
  - "PowerBrowserAgent actor pair (parent in PowerBrowserAPI.sys.mjs, child in GroupActorChild.sys.mjs)"
  - "agentControlChanged push; agent flag and container on webTabOpen; parking and overlayShownToUser"
  - "orca-browser-tab-scope (+ self-test, quick), no-remote-agent-port-live (+ self-test, full)"
affects: [lane p66-02 (frontend side of the contract), lane p66-04 (snapshot arm), coordinator 66-05/66-06]
tech-stack:
  added: []
  patterns: ["shipped chrome source sliced and evaluated in node:vm over a stub boundary", "per-plan catalogue remap through a line diff"]
key-files:
  created:
    - scripts/verify-orca-browser-tab-scope.mjs
    - scripts/verify-no-remote-agent-port-live.mjs
  modified:
    - powerbrowser/shell/PowerBrowserAPI.sys.mjs
    - powerbrowser/shell/GroupActorChild.sys.mjs
    - powerbrowser/INTERNAL-APIS.md
    - scripts/check-internals-boundary.sh
    - scripts/verify-web-tab-bridge.mjs
    - scripts/verify-ext-tab-host-scope.mjs
    - scripts/verify-platform.sh
    - website-staging/privacy.html
decisions:
  - "Agent overlays get their own message manager group (powerbrowser-orca-agent) and no autocomplete popup, so Gecko's LoginManager actor never attaches (coordinator finding 3)"
  - "dialogAccept/dialogDismiss answer only alert, alertCheck, confirm, confirmCheck and prompt; anything else answers failed browser_command_unavailable"
  - "browser.pdf prints into an in-memory storage stream (no profile temp file)"
  - "browser.cookie.delete deletes by re-adding with a past expiry, keeping Services.cookies.remove the token-guarded clear helper's alone"
metrics:
  completed: 2026-11-10
actuals:
  tasks: 3
  commits: 5
plan_head_before: 5a13abab
plan_head_after: "the commit that adds this file (head of ServerDestroyer/p66-03)"
---

# Phase 66 Plan 03: Chrome bridge for Orca agents Summary

Orca agents drive only the PowerBrowser web tabs chrome created as agent tabs. The bridge serves all 40 tier-1 methods: 15 natively in chrome and 25 in a new PowerBrowserAgent content actor. It parks unshown agent tabs without taking the user's focus. Agent tabs live in their own container and message manager group, so they get no saved logins, and Stop ends agent control for good. No WebDriver BiDi module is used.

## Commits

| Task | Commit | Message |
|---|---|---|
| 1 | 01fab06b | feat(66-03): agent flag, wall, click through the agent child, screenshot, parking, one visibility predicate |
| 2 | 56e21dfc | feat(66-03): all tier-1 rows, agent container, dialogs, mark state and Stop, A2 allowance |
| 2 (coordinator finding 3) | b383a724 | fix(66-03): isolate agent overlays from the login manager and answer only page dialogs |
| 2 (follow-up) | 5518768d | fix(66-03): keep the agent-group read out of the wall and the stock attribute rule exact |
| 3 | this commit | feat(66-03): no-remote-agent-port check, privacy paragraph and lane summary |

## What was built

- **Section `// ---- Orca agent bridge (66-03, BRW-03/BRW-04) ----`** at the end of PowerBrowserAPI.sys.mjs. It holds `AGENT_METHODS` (frozen, 40 entries), one params validator per method, `agentWallVerdict`, `handleWebTabAgent` and `handleWebTabAgentStop`, the native row table, actor routing, `overlayShownToUser`, `webTabPlacement` (parking), the mark state, the container, the focus guard, `PowerBrowserAgentParent` and `registerAgentActor`. Nothing runs at the section's top level.
- **The wall.** Checks run in this order:
  1. tabId shape.
  2. Method in `AGENT_METHODS`.
  3. The method's validator.
  4. The `webTabs` entry exists and was opened by this sender's frontend; otherwise `unknown-tab`, which covers every stock-window tab.
  5. `entry.agent === true` and the page's `browsingContext.originAttributes.userContextId` equals the agent container; otherwise `not-agent-tab` (coordinator finding 2).
  6. Stopped; otherwise `agent-stopped`.

  All six checks run before any page work.
- **In-place edits:**
  - `webTabOpen` gains a last parameter, `agent = false`.
    - Already-open returns before the flag is touched.
    - An agent tab gets the container id, `messagemanagergroup` `powerbrowser-orca-agent` and an empty `autocompletepopup` in the attribute literal, all before `appendChild`.
    - If no container can be had, it answers `unavailable` and creates no overlay.
  - The `webTabOpen` arm refuses any `agent` value except `true`.
  - `WEB_TAB_ACTION_KINDS` and `handleWebTabAction` gain `webTabAgent` and `webTabAgentStop`.
  - `webTabGeometry` places overlays through `webTabPlacement`.
  - `webTabClose` (and therefore `webTabDropOwnedBy`) ends the mark state and aborts in-flight calls.
  - The seven raw `style.visibility` reads now call `overlayShownToUser`.
  - `registerGroupActor` calls `registerAgentActor()`.
  - `lazy` gains `ContextualIdentityService`.
- **Mark state (P66-20/22).**
  - A served call lights `active` and pushes `agentControlChanged { tabId, active, stopped }`.
  - The mark clears after 20000 ms with no call, and never while a call is in flight.
  - Stop sets `stopped` for the tab's lifetime, sends `PowerBrowserAgent:Abort`, resolves in-flight calls as `agent-stopped`, and pushes once.
  - Close clears the mark with a push.
- **Coordinator finding 1 (focus).** Overlays already carry `tabindex -1`, and parked overlays keep `docShellIsActive false`.
  - A capturing `focus` guard on the shell window returns focus to the shown overlay, or else to the Theia frame, when focus lands on a parked agent overlay.
  - Parking an overlay that holds focus returns focus the same way.

### Per-method mechanism list (P66-11)

- **Native in chrome (15):**
  - `browser.goto`, `back`, `forward`, `reload`: the existing `webTabNavigate`/`Back`/`Forward`/`Reload`. The http(s) scheme wall applies, and a refusal answers `browser_navigation_failed`. `goto` adds `https://` to a scheme-less URL.
  - `screenshot` and `fullScreenshot`: `drawSnapshot` at the shell window's device pixel ratio. `fullScreenshot` asks the child for the document size (`PowerBrowserAgent:Size`) and caps each side at 16384 device px.
  - `pdf`
  - `cookie.get`, `cookie.set`, `cookie.delete`: agent container only.
  - `network`
  - `capture.start`, `capture.stop`: network half in chrome, console half read from the child's buffer.
  - `dialogAccept`, `dialogDismiss`
- **Actor (25):**
  - Pointer: `click`, `dblclick`, `hover`, `drag`, `mouseClick`, `mouseDown`, `mouseMove`, `mouseUp`, via `Window.synthesizeMouseEvent`.
  - Wheel: `mouseWheel`, `scroll`, via `windowUtils.sendWheelEvent` with `DOM_DELTA_PIXEL`.
  - Keys: `keypress`, `type`, via `nsITextInputProcessor`; `keypress` supports modifier combos.
  - Text: `keyboardInsertText`, via `sendContentCommandEvent("insertText")`.
  - `eval`: the page's own `Function` through `wrappedJSObject`. The result is a page object polled for primitives, so no chrome function is handed to the page.
  - Form rows: `check`, `clear`, `fill`, `select`, `selectAll`. Values are set through Xray, then `input`/`change` are dispatched; contenteditable uses `insertText`.
  - `focus`, `scrollIntoView`
  - `wait`: polls for selector/state, text, URL glob, load state or fn. Answers `browser_timeout`, or `browser_owner_unavailable` after Abort.
  - `console`: `nsIConsoleAPIStorage` filtered by `innerWindowId`, plus the window's `error` events (A-4), from `actorCreated`.
  - `exec`: `read`, `get`, `is` only; every other verb answers `browser_command_unavailable` (P66-17).
  - `snapshot`: answers `browser_command_unavailable` until lane p66-04 replaces the arm.
- **Element targets** are CSS selectors. An invalid selector answers `browser_error`, and no match answers `browser_ref_not_found`.
- **Moves between native and actor:** none relative to P66-11. Dialogs are native (A4), and capture is native plus child as P66-11 lists.

### Assumption A-3 fallback order, as built

1. The requested format (PNG by default).
2. JPEG.
3. JPEG at half scale.
4. Otherwise `failed browser_error`.

The budget is Orca's 768 KiB result limit, with 64 bytes of headroom. PDF has no fallback; over budget it answers `browser_error`.

### Coordinator finding 3 (HIGH): logins and dialogs

- **Saved logins.** Gecko's `LoginManager` actor is registered only for message manager groups `browsers`, `webext-browsers`, `chatbot-browser` and `""` (`upstream/toolkit/modules/ActorManagerParent.sys.mjs`). Agent overlays are in `powerbrowser-orca-agent`, so the actor is never created there. That means no autofill, no capture doorhanger and no login dropdown.
- **Other saved entries.** The empty `autocompletepopup` removes the dropdown for every saved-entry type (form history, addresses, cards).
- **WebExtensions.** The extension tab host already skips any overlay outside `browsers`, so the user's WebExtensions do not see agent tabs.
- **Group registration.** The PowerBrowserAgent pair is registered for the agent group alone.
- **Dialogs.** Only alert, confirm and prompt (and their checkbox variants) can be answered. HTTP auth (which the login manager prefills), beforeunload (`inPermitUnload`) and every other commonDialog answer `failed browser_command_unavailable`. Permission prompts and file pickers are not commonDialog windows, so `agentDialogWindow` never matches them.
- **Live clause not run.** The live clause (a saved login in a scratch profile, the same login form in an agent tab and in a user tab, plus an auth-prompt plant) needs agent tabs, which only lane p66-02's frontend can open. It is listed under owner items for the merged-tree run.

## New INTERNAL-APIS rows (28)

| Internal | File:Line | Method |
|---|---|---|
| `drawSnapshot` | PowerBrowserAPI.sys.mjs:11315 | agentScreenshot |
| `ChromeUtils.registerWindowActor` | PowerBrowserAPI.sys.mjs:11700 | registerAgentActor |
| `JSWindowActorChild` | GroupActorChild.sys.mjs:620 | PowerBrowserAgentChild |
| `Services.prefs.getIntPref` | PowerBrowserAPI.sys.mjs:11235 | agentContainerId |
| `ContextualIdentityService` (getPublicIdentityFromId) | PowerBrowserAPI.sys.mjs:11236 | agentContainerId |
| `ContextualIdentityService` (create) | PowerBrowserAPI.sys.mjs:11239 | agentContainerId |
| `Services.prefs.setIntPref` | PowerBrowserAPI.sys.mjs:11240 | agentContainerId |
| `Cc` / `Ci.nsIPrintSettingsService` | PowerBrowserAPI.sys.mjs:11321 | agentPdf |
| `Ci.nsIPrintSettings` | PowerBrowserAPI.sys.mjs:11327, :11330 | agentPdf |
| `Cc` / `Ci.nsIStorageStream` | PowerBrowserAPI.sys.mjs:11328 | agentPdf |
| `browsingContext.print` | PowerBrowserAPI.sys.mjs:11332 | agentPdf |
| `Cc` / `Ci.nsIBinaryInputStream` | PowerBrowserAPI.sys.mjs:11333 | agentPdf |
| `Services.cookies.getCookiesFromHost` / `getCookiesWithOriginAttributes` | PowerBrowserAPI.sys.mjs:11389 | agentCookieGet |
| `Ci.nsICookie` | PowerBrowserAPI.sys.mjs:11403 | agentCookieSet |
| `Services.cookies.add` | PowerBrowserAPI.sys.mjs:11404 | agentCookieSet |
| `Ci.nsICookieValidation` | PowerBrowserAPI.sys.mjs:11405 | agentCookieSet |
| `Services.cookies.getCookiesFromHost` | PowerBrowserAPI.sys.mjs:11418 | agentCookieDelete |
| `Services.cookies.add` (past expiry) | PowerBrowserAPI.sys.mjs:11420 | agentCookieDelete |
| `Services.obs.addObserver` | PowerBrowserAPI.sys.mjs:11436, :11437 | agentNetworkInstall |
| `Ci.nsIHttpChannel` | PowerBrowserAPI.sys.mjs:11443 | agentNetworkObserver |
| `Services.wm.getEnumerator` | PowerBrowserAPI.sys.mjs:11477 | agentDialogWindow |
| `Cc` / `Ci.nsITextInputProcessor` | GroupActorChild.sys.mjs:272 | agentTextInput |
| `wrappedJSObject` | GroupActorChild.sys.mjs:352 | agentPageEval |
| `Cc` / `Ci.nsIConsoleAPIStorage` | GroupActorChild.sys.mjs:632 | actorCreated |
| `Cc` / `Ci.nsIPrincipal` (system principal) | GroupActorChild.sys.mjs:633 | actorCreated |
| `wrappedJSObject` | GroupActorChild.sys.mjs:635 | actorCreated |

The catalogue header now states the A2 allowance. Existing rows were renumbered through a line diff of each edit; `verify-ng-040 --fix` mis-assigned 37 rows on the first large shift, so its output was discarded and the diff remap used instead.

## A2 boundary allowance

- `ACTOR_CHILD_PATTERNS=('wrappedJSObject' 'JSWindowActorChild' 'Cc[' 'Ci.')`, with a comment naming A2 and Phase 66.
- The boundary self-test plants an uncatalogued child `Cc[` line, an uncatalogued `Ci.` line and a `Services.` line. Each goes red naming `GroupActorChild.sys.mjs:2: <pattern>`.
- `verify-web-tab-bridge.mjs` rule 7 still bans `Cu.`, `Services.` and `cloneInto` in the child. It accepts `Ci.` only on a child line whose INTERNAL-APIS table row names that line, and a self-test case plants an uncatalogued `Ci.` line.
- Non-comment `Services.`/`Cu.`/`nodePrincipal` lines in the child: 0.
- No BLOCKER: no row needed a pattern beyond `Cc[` and `Ci.`, and no WebDriver BiDi module.

## Check results (lane, no objdir)

| Row | Result |
|---|---|
| orca-browser-tab-scope | PASS: 40 methods (15 native, 25 actor); "page-table clause SKIP (lane p66-02 not merged)"; pinned LoginManager groups exclude the agent group |
| orca-browser-tab-scope-self-test | PASS: 17 planted faults each red naming the drift |
| gui02-web-tab-bridge | PASS: "agent contract SKIP (lane p66-02 not merged)" |
| gui02-web-tab-bridge-self-test | PASS: 73 plants (6 new: unclassified webTabAgent, second sender, agentStop( from tab-uris, missing union member, missing agentControlChanged subscription, uncatalogued child Ci.), plus a green control with p66-02's side simulated |
| internals-boundary, -self-test, internals-catalogue, ng-040 | PASS |
| verify-new-window-adopt, verify-page-tools-edit, verify-ext-tab-host-scope, verify-extension-actions, site-identity | PASS |
| privacy-hosts, shell-error-copy-no-internals | PASS |
| no-remote-agent-port-live-self-test | PASS (8 verdict plants); live half see below |
| no-remote-agent-port-live | lane: SKIP (no objdir); live run against the base build: **FAIL**, see below |

Baseline (.mozbuild/p66-03/baseline.txt) was green for catalogue, bridge and adopt, and they are still green. `upstream/` in the lane is a symlink to the v1.7 worktree's checkout at FIREFOX_153_5_1esr_RELEASE, which `verify-new-window-adopt` needs.

Quick-gate rows red in the lane, none caused by a code defect of this lane:

- **page-tools-reader-crash and -self-test.** These are cross-lane. The check compares chrome's case arms with the `WebTabMessage` union, and lane p66-02 adds `webTabAgent`/`webTabAgentStop` to that union. They should turn green on the merged tree. The check has no lane-SKIP and is outside this lane's files.
- **scan-brand-residue and -self-test.** These are the expected brand rows (see below).
- **gui09-dependent-window-content and -self-test, tab-uris-typecheck, chrome-bar-typecheck, orca-terminal-keys-self-test.** These are environment reds: there is no Theia build and no `orca/` in the lane worktree.

## no-remote-agent-port-live: full socket list

Run with `PB_FIREFOX_BIN=/home/chris/orca/workspaces/Power-Browser/v1.7-Orca-integration/objdir/dist/bin/powerbrowser`, the v1.7 base build from Nov 8. That build predates this lane, but this lane adds no listener. `orca/` was a temporary symlink to the v1.7 worktree's built orca. It ran under `flock /home/chris/coding/Power-Browser/.git/pb-live.lock` with ORCA_* unset, after `tab-store` accounting was added:

```
no-remote-agent-port-live: socket control 127.0.0.1:39281 pid 3950167 powerbrowser unaccounted
no-remote-agent-port-live: socket control 127.0.0.1:46687 pid 3950329 MainThread sidecar
no-remote-agent-port-live: socket control 127.0.0.1:40479 pid 3950329 MainThread tab-store
no-remote-agent-port-live: socket control 127.0.0.1:41011 pid 3950374 MainThread unaccounted
no-remote-agent-port-live: socket control 127.0.0.1:29191 pid 3950374 MainThread orcad
no-remote-agent-port-live: socket shipped 127.0.0.1:42973 pid 3952901 MainThread sidecar
no-remote-agent-port-live: socket shipped 127.0.0.1:39263 pid 3952901 MainThread tab-store
no-remote-agent-port-live: socket shipped 127.0.0.1:44295 pid 3953102 MainThread unaccounted
no-remote-agent-port-live: socket shipped 127.0.0.1:25583 pid 3953102 MainThread orcad
no-remote-agent-port-live: FAIL -- the shipped build listens on a port PowerBrowser does not account for:
  the shipped build listens on 127.0.0.1:44295, owned by pid 3953102 (MainThread), which is neither the sidecar's nor orcad's port
```

(The failure wording now reads "which is not a port PowerBrowser accounts for (sidecar, orcad, tab-store)".)

The first run, before `tab-store` accounting, showed the same shape. Shipped:

```
no-remote-agent-port-live: socket shipped 127.0.0.1:40965 pid 3927606 MainThread sidecar
no-remote-agent-port-live: socket shipped 127.0.0.1:34049 pid 3927606 MainThread unaccounted
no-remote-agent-port-live: socket shipped 127.0.0.1:40689 pid 3927640 MainThread unaccounted
no-remote-agent-port-live: socket shipped 127.0.0.1:22465 pid 3927640 MainThread orcad
```

The self-test's live control went red naming the Remote Agent: `ok  live control (--remote-debugging-port=0) -> red, naming 127.0.0.1:44239 pid 3928085 (powerbrowser)`. It ended `self-test: PASS`, exit 0.

**Findings:**

- The detector works. The Remote Agent socket appears only in the control, on the main `powerbrowser` process. The shipped build has **no** socket on the main process, so there is no WebDriver BiDi port, which is criterion 2's substance.
- The extra sidecar socket is PowerBrowser's own token-gated tab-store endpoint (Phase 29, `tab-store-access-endpoint.ts`). It is now accounted for from `<profile>/store-access.json`, whose filename is read from `tab-store-access-protocol.ts`; only the URL's port is read.
- orcad's process holds a **second loopback listener**, an ephemeral port that orcad's state file does not name. That keeps the row red on the base build. Candidates in Orca's source are `listen(0, '127.0.0.1')` servers such as the local-build feed server, the plugin-panel guest sessions, the worktree label proxy and the CDP ws proxy. It was not identified.

## Brand rows (for the coordinator; inventory/brand-tokens.json not edited)

Unclaimed occurrence lines from `scan-brand-residue` (condition 4). The report is at `.mozbuild/p66-03/brand-report.md`.

| File | Orca | orca | ORCA |
|---|---|---|---|
| powerbrowser/shell/GroupActorChild.sys.mjs | 5 | 0 | 0 |
| powerbrowser/shell/PowerBrowserAPI.sys.mjs | 0 | 7 | 0 |
| scripts/verify-ext-tab-host-scope.mjs | 1 | 0 | 0 |
| scripts/verify-no-remote-agent-port-live.mjs | 6 | 36 | 6 |
| scripts/verify-orca-browser-tab-scope.mjs | 4 | 20 | 1 |
| scripts/verify-web-tab-bridge.mjs | 4 | 22 | 14 |
| website-staging/privacy.html | 3 | 0 | 0 |

Held-back totals observed: Orca 2132 (expected 2108), orca 4207 (4199), ORCA 847 (846), orcad 1221 (1218).

## Deviations from Plan

1. **[Coordinator finding 3] `scripts/verify-ext-tab-host-scope.mjs` was edited, which is outside files_modified.** Its messagemanagergroup rule allowed one write only, the `"browsers"` literal. The fix needs an agent-only override inside the same `webTabOpen` literal, so the rule now also accepts `messagemanagergroup: AGENT_MESSAGE_MANAGER_GROUP` within `webTabOpen`. Its self-test passes with 27 plants. Because of this file, the Task 3 lane-diff check (diff ⊆ files_modified) lists one extra path.
2. **[Rule 1] `browser.cookie.delete`** deletes by re-adding with a past expiry, which is Gecko's Set-Cookie deletion path (`CookieStorage::AddCookie`). `verify-site-identity.mjs` requires `Services.cookies.remove(` to appear only in the token-guarded clear helper. A second `remove` turned site-identity red.
3. **[Rule 1] The wall does not read `messagemanagergroup`.** `verify-extension-actions.mjs` forbids that attribute outside `webTabOpen` and `tabHostAddTab`. That same check proves nothing can move an agent overlay out of its group. The wall still checks the container through originAttributes.
4. **[Rule 2] `browser.pdf`** prints into an in-memory `nsIStorageStream` (WebDriver's own form) instead of a profile temp file, so nothing is written to disk.
5. **[Rule 2] Coordinator findings 1–3** were added in Task 2 and its two fix commits: the focus guard, the wall's container check, the agent group, the autocomplete removal and the dialog-type filter. Each has a check clause and a plant.
6. **[Rule 3] Agent override keys are quoted** (`"usercontextid"`, `"autocompletepopup"`) so that bridge rule 4's planted removal of the stock `autocompletepopup` stays red. The rule matches unquoted keys only.
7. **[Rule 3] `upstream/` was symlinked** to the v1.7 worktree's checkout (ignored path) so `verify-new-window-adopt` could read the pinned IDL. `orca/` was symlinked only for the live run and then removed.
8. **[Rule 2] no-remote-agent-port-live also accounts for the tab-store endpoint**, derived at run time from the profile, because the plan's two-port derivation missed PowerBrowser's own Phase 29 listener.
9. **expectUrl is not enforced.** Orca's `expectUrl` param is accepted by the validators but not compared with the page URL. A mismatch is not answered with `expectedUrlMismatch`.

## Known limits

- The page-world `eval` (and `wait`'s `fn`) uses the page's `Function`, so a page CSP without `unsafe-eval` answers `browser_eval_error`.
- Timers in a parked page with an inactive docshell may be throttled, so a `wait` polls at about 1 s there (assumption A-2).
- Console capture starts when chrome first asks the document for its child, so messages logged before the first agent command on a page are not in the buffer.
- The network log starts with the first agent tab of the session and keeps the last 500 requests per tab.

## Owner items

- **O-66-03-a.** orcad's second, unaccounted loopback listener makes `no-remote-agent-port-live` red on the base build. Decide whether orcad's extra listener is acceptable and how it is derived (an orcad-reported port), or whether it must not exist. The Remote Agent itself is absent from the shipped build.
- **O-66-03-b.** The live clauses the coordinator asked for need agent tabs, which only the merged frontend (lane p66-02) can open, and a build of this branch:
  - Focus: a parked agent page calling `window.focus()`/`element.focus()` while the user types. The user's tab must keep focus and receive every key, with a positive control first.
  - Logins: a saved login in a scratch profile, with the login form in an agent tab (no autofill, no capture prompt) versus a user tab (autofilled, the positive control).
  - Dialogs: an HTTP auth prompt in an agent tab refused by `dialogAccept`.

  They are specified here for the 66-05/66-06 live rows. The vm clauses and plants already cover the chrome logic.
- **O-66-03-c.** `webTabOpen` with `agent: true` answers `unavailable` when the container cannot be created. The p66-02 frontend should treat any unknown `where` as a failed open.

## Coordinator proof commands

```sh
nix develop .#firefox --command bash -c 'cd upstream && MOZCONFIG=../.mozconfig ./mach build faster'
flock /home/chris/coding/Power-Browser/.git/pb-live.lock scripts/verify-platform.sh --only no-remote-agent-port-live
flock /home/chris/coding/Power-Browser/.git/pb-live.lock scripts/verify-platform.sh --only no-remote-agent-port-live-self-test
# after merging p66-02 (the cross-lane clauses must print as compared, not SKIP):
scripts/verify-platform.sh --only orca-browser-tab-scope
scripts/verify-platform.sh --only gui02-web-tab-bridge
scripts/verify-platform.sh --only page-tools-reader-crash
```

Run the live rows with ORCA_* unset; the scripts set MOZ_PURGE_CACHES=1 themselves.

## Merge note for the coordinator

- The registry blocks are third at both anchors:
  - Quick: `orca-browser-tab-scope` and `-self-test`, before `"allowlist-schema|check_allowlist_schema"`.
  - Full: `no-remote-agent-port-live` and `-self-test`, before the `)` closing the `if [ "$QUICK" -eq 0 ]` CHECKS list.
- Lane p66-04 builds on this branch. It replaces the child's `browser.snapshot` arm and extends `agentElement` with `@eN` refs.
- Brand rows are needed for the files listed above.
- No WINDOWS.md ids.
- `verify-ext-tab-host-scope.mjs` is touched by this lane only.
- `git merge` by `refs/heads/ServerDestroyer/p66-03`.

## Self-Check: PASSED

- scripts/verify-orca-browser-tab-scope.mjs, scripts/verify-no-remote-agent-port-live.mjs: FOUND
- 01fab06b, 56e21dfc, b383a724, 5518768d: FOUND on ServerDestroyer/p66-03
