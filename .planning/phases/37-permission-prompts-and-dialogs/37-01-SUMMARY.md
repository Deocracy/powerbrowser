---
phase: 37-permission-prompts-and-dialogs
plan: "01"
subsystem: chrome-boundary
tags: [permission-prompts, doorhanger, PopupNotifications, furniture, queue, live-harness, static-gate]
status: complete
live_proof: deferred
requires:
  - phase: 31.1-extension-tab-host
    provides: the tab host (selection, hidden strip firing TabSelect/TabClose, tabs-progress listeners)
  - phase: 27-groundwork-navigation-buttons-and-page-focus-keys
    provides: the WebTabChannel.onPush router, sendWebTabPush, the Phase 27 shim policy
provides:
  - installPermissionPromptFurniture(window) in the Phase 37 end-of-file section of PowerBrowserAPI.sys.mjs
  - window.PopupNotifications (stock module) on the shell window, #notification-popup panel and anchor in powerbrowser.xhtml
  - display-only doorhanger push {token, tabId, permission, displayHost, pending} and its web-tab.ts subscriber
  - background queue, cap 3 per shell window, oldest cancelled through the stock removal
  - scripts/verify-permission-prompts.mjs (rules a-g, --self-test, 9 plants)
  - FACADES mechanism in scripts/verify-shell-gbrowser-standin.mjs (promptTabbrowser row)
  - scripts/verify-prompts-live.mjs (4 scenarios, 5 plants, --self-test --static)
affects:
  - 37-02 (webRTC template and sharing indicator land in the same panel and section; the show wrapper already covers WebRTCParent)
  - 37-03 (dialogs), 37-04 (password template and bars) extend the same section and live harness
  - Phase 35 merge (the bootstrap call folds into installShellFurniture; rule (a) moves to verify-shell-furniture.mjs)
tech-stack:
  added: []
  patterns:
    - stock upstream module on the shell window behind a member-audited tabbrowser facade (FACADES)
    - instance-level wrap of a stock method to compose the per-notification eventCallback (display-only observation)
key-files:
  created:
    - scripts/verify-permission-prompts.mjs
    - scripts/verify-prompts-live.mjs
  modified:
    - powerbrowser/shell/PowerBrowserAPI.sys.mjs
    - powerbrowser/shell/powerbrowser.js
    - powerbrowser/shell/powerbrowser.xhtml
    - powerbrowser/INTERNAL-APIS.md
    - theia/extensions/tab-uris/src/browser/web-tab.ts
    - theia/extensions/chrome-bar/src/browser/tab-strip-widget.tsx
    - theia/extensions/chrome-bar/src/browser/chrome-bar-copy.ts
    - scripts/verify-shell-error-copy.mjs
    - scripts/verify-shell-gbrowser-standin.mjs
    - scripts/check-internals-boundary.sh
    - scripts/verify-shell-error-contract.mjs
    - scripts/verify-platform.sh
key-decisions:
  - "The stock module is imported from resource://gre/modules/PopupNotifications.sys.mjs, where upstream's toolkit/modules/moz.build ships it (EXTRA_JS_MODULES); the gate derives the URL from moz.build."
  - "The tabbrowser facade is documentGlobal, selectedBrowser, selectedTab and tabContainer = the tab host's strip, so stock TabSelect shows a waiting prompt on webTabActivated and stock TabClose cancels a closed tab's prompts; no queue-show code exists."
  - "The doorhanger topics are observed by wrapping the instance's show and composing options.eventCallback; eventCallback is a show() option, not a constructor option."
  - "The background queue cap is 3 per shell window: stock keeps one notification per id per browser, so a per-tab cap would almost never bind."
  - "A dismissed prompt keeps pending true (a persistent prompt re-shows when its tab is selected); only removal sends pending false."
  - "The pending-prompt mark is in the tab strip (chrome-bar tab-strip-widget.tsx): the overlay covers the web tab widget's node, and tab-uris cannot import CHROME_BAR_COPY."
patterns-established:
  - "Each tabbrowser facade handed to an upstream module is one FACADES row, compared member by member against what that module reads."
requirements-completed: []
duration: "not measured"
completed: "2026-10-31"
commits: 3
plan_head_before: 23c08bb5dd176949f619cf8781cf34fb54c74f6d
plan_head_after: 41b10ad78eb0b3eb904f870bd582b70053db27e2
actuals:
  tokens: 18809
  tasks: 3
  commits: 3
---

# Phase 37 Plan 01: Stock doorhanger furniture, display-only push, background queue and gates Summary

**The stock PopupNotifications now runs on the shell window with the #notification-popup panel. Its tabbrowser facade sits over the tab host and is audited member by member. Prompts are answered only through the stock panel buttons. The tab strip shows a display-only pending mark. Background requests queue (cap 3, the oldest cancelled through the stock removal). A static gate and a live harness cover all of this. The live run is deferred because this lane has no built binary.**

## Status

Complete for every static criterion. `scripts/verify-platform.sh --quick` is green after each task. **The live proof is deferred** to the end-of-milestone live pass, per the owner override for this run: there is no `objdir`, so no binary can run. `verify-prompts-live.mjs` is written and registered. Its offline half (`--self-test --static`) passes. The four live scenarios and the five live plants have **not** been run. No live evidence is claimed.

PROMPT-01 is not marked complete: its live truths (stock Allow resolves the page promise, the delay proof, the background wait) are unproven until that pass.

## Performance

- **Tasks:** 3 of 3 executed.
- **Commits:** 3 task commits (`107a3c72`, `30967ec6`, `41b10ad7`), plus this SUMMARY commit.
- **Realized diff:** about 18,809 tokens by the chars/4 estimate (plan estimate 95,000). The live scenarios are compact, and no live-debug iterations happened.

## Accomplishments

- **Furniture (D-01).** `installPermissionPromptFurniture(window)` constructs the real `PopupNotifications(promptTabbrowser, #notification-popup, null)`. The `if (!window.PopupNotifications)` guard became a `WeakSet` window guard, so the guard line needs no catalogue row. The panel is upstream's markup verbatim inside a `xul:popupset`. The anchor `powerbrowser-notification-anchor` is placed in the 8px strip above the asking page each time a prompt is `showing`.
- **Anchoring (N4).** Every asking overlay gets `popupnotificationanchor="powerbrowser-notification-anchor"`. With `iconBox` null this is the only anchor lookup. The stock per-kind anchor ids are not copied.
- **Answer route (D-11).** No answer handler, no webTab kind and no permission write were added. The stock button `click` listener runs `PopupNotifications._onButtonEvent`, so the stock click delay applies.
- **Doorhanger push (display-only).** `showing` and `shown` send `pending: true`, and so does a request that is queued. `removed` sends `pending: false`. The fields are token, tabId, the stock notification id, and `displayHost` (from the overlay's own `contentPrincipal.asciiHost`). No principal, URL or callback crosses to Theia.
- **Background queue (D-04).** A request that does not show at once waits in the stock per-browser list. A fourth waiting request in the window removes the oldest with `remove(n, true)`. That fires the stock `removed` callback without a user response, which runs PermissionUI's `cancel()` and then `request.cancel()`. Activation is the stock `TabSelect` from the tab host strip.
- **Location change.** A new top-level document calls the stock `locationChange` (parity with browser.js `onLocationChange`), so a page that navigated away leaves no stale prompt.
- **Theia.** `onPush('doorhanger')` keeps a per-widget set of pending tokens. The tab strip renders a `codicon-bell` mark with `CHROME_BAR_COPY.pendingPrompt` ("This page asked for a permission. Open the tab to answer it."). The mark has no handler. The copy row is pinned in `EXPECTED_NAV_COPY`.
- **Gates.** `verify-permission-prompts.mjs` rules (a)-(g) are all derived from the tree, with 9 plants after a same-session green control. The `FACADES` comparison in `verify-shell-gbrowser-standin.mjs` gained two plants. `check-internals-boundary.sh` gained a plant for the import and construction outside the boundary file. The bridge gate's rule 9 sees the `doorhanger` push and its subscriber.

## Verification results (this lane)

| Check | Result |
|---|---|
| `node scripts/verify-permission-prompts.mjs` | PASS |
| `node scripts/verify-permission-prompts.mjs --self-test` | PASS (control green, 9 plants red) |
| `node scripts/verify-shell-gbrowser-standin.mjs` (+ `--self-test`) | PASS (facade `promptTabbrowser {documentGlobal, selectedBrowser, selectedTab, tabContainer}`) |
| `bash scripts/check-internals-boundary.sh --self-test` / `--catalogue` | PASS / PASS |
| `node scripts/verify-ng-040-internals-catalogue-lines.mjs` (`--fix` no-op) | PASS |
| `node scripts/verify-web-tab-bridge.mjs` (+ `--self-test`) | PASS (32 kinds, no KIND_CLASSES entry added) |
| `node scripts/verify-shell-error-copy.mjs --self-test` | PASS |
| `node scripts/verify-prompts-live.mjs --self-test --static` | PASS (a planted expect typo and an unapplied plant both went red) |
| `node scripts/verify-prompts-live.mjs --self-test` / `--scenario …` | NOT RUN: BROKEN INSTRUMENT, no built binary (deferred) |
| `cd theia && nix develop ..#theia --command yarn build:extensions` | PASS (all 7 extensions, `tsc -b`) |
| `nix develop .#theia --command scripts/verify-platform.sh --quick` | PASS after Task 1, Task 2 and Task 3 (final run: all checks passed, no FAIL row) |

Restart note: chrome JS and XHTML under `powerbrowser/shell` are symlinked into the objdir and load with `MOZ_PURGE_CACHES=1`. No `jar.mn` change and no new file under `powerbrowser/shell` were made, so no Gecko rebuild is needed for this plan.

## Task Commits

1. **Task 1: static gate, self-test plants, self-test row** — `107a3c72` (test)
2. **Task 2: furniture, doorhanger push, background queue, tree row** — `30967ec6` (feat)
3. **Task 3: live stock-click scenarios and live rows** — `41b10ad7` (test)

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Module URL is resource://gre, not moz-src**
- **Found during:** Task 1
- **Issue:** The plan names `moz-src:///toolkit/modules/PopupNotifications.sys.mjs`. Upstream's `toolkit/modules/moz.build` lists the file under `EXTRA_JS_MODULES`, and browser.js imports `resource://gre/modules/PopupNotifications.sys.mjs`.
- **Fix:** The import uses the resource URL. Rule (b) derives the expected URL from moz.build, so a rebase that moves the module goes red.
- **Commit:** `107a3c72`, `30967ec6`

**2. [Rule 1 - Bug] eventCallback is a show() option, not a constructor option**
- **Found during:** Task 2
- **Issue:** The constructor takes only `shouldSuppress` and `getVisibleAnchorElement`. `eventCallback` (`PopupNotifications.sys.mjs:528`) is set per notification by PermissionUI.
- **Fix:** The instance's `show` is wrapped. The wrapper composes the caller's `eventCallback`: it observes the topic first, then returns the stock callback's value unchanged.
- **Commit:** `30967ec6`

**3. [Rule 1 - Bug] The facade needs documentGlobal, and tabContainer is the host strip**
- **Found during:** Task 2
- **Issue:** The constructor reads `tabbrowser.documentGlobal` (`:282`), which the plan's three-member facade lacks.
- **Fix:** The facade has four members. The FACADES comparison derives them from what the module reads. `tabContainer` is the tab host's hidden strip, which already fires `TabSelect` and `TabClose`. Stock code therefore shows a waiting prompt on activation and cancels a closed tab's prompts, so no separate queue-show path exists.
- **Commit:** `30967ec6`

**4. [Rule 1 - Bug] The pending mark is in the tab strip, not in the web tab widget node**
- **Found during:** Task 2
- **Issue:** The chrome overlay copies the web tab widget's rect, so anything rendered in that node is hidden under the page. Also, `web-tab.ts` (tab-uris) cannot import `CHROME_BAR_COPY`, because chrome-bar depends on tab-uris.
- **Fix:** `web-tab.ts` owns the state (the subscriber and `pendingPrompts`). `tab-strip-widget.tsx` renders the mark using the copy row. This adds one file to the plan's file list. The strip is also where a background tab's waiting prompt is visible.
- **Commit:** `30967ec6`

**5. [Rule 1 - Bug] Dismissed keeps pending true**
- **Found during:** Task 2
- **Issue:** The plan sends `pending: false` on `dismissed`. A dismissed persistent permission prompt still waits for its answer, and `_update` re-shows persistent notifications when the tab is selected.
- **Fix:** Only `removed` clears the mark.
- **Commit:** `30967ec6`

**6. [Rule 2 - Missing functionality] locationChange on a new top-level document**
- **Found during:** Task 2
- **Issue:** Without the browser.js `onLocationChange` call, a prompt from a page that navigated away stays on screen.
- **Fix:** A tabs-progress listener on the tab host calls the stock `locationChange` (one `Ci.` line, catalogued).
- **Commit:** `30967ec6`

**7. [Rule 3 - Blocking] The node harness stub lacked the new export**
- **Found during:** Task 2 (`--quick` run: `shell-error-contract` and its self-test went red with `installPermissionPromptFurniture is not a function`)
- **Fix:** The `verify-shell-error-contract.mjs` module stub returns a no-op installer.
- **Commit:** `30967ec6`

### Scope and structure deviations

- **Lane override for Phase 35:** `installShellFurniture` is absent. The installer is `installPermissionPromptFurniture(window)`, called from one bootstrap line in `powerbrowser.js` with a fold-at-merge comment. `verify-shell-furniture.mjs` was not created. The furniture-vs-upstream check is rule (a) of `verify-permission-prompts.mjs`, and it **moves to `verify-shell-furniture.mjs` at merge**.
- **Anchor attribute at request time:** `popupnotificationanchor` is set in the show wrapper, not at overlay creation in `webTabOpen`. This keeps the append-only rule (no line above the catalogue moves), and every overlay that asks is covered.
- **Queue cap scope:** the cap is 3 per shell window, not per tab (see key decisions). The live `cancel-on-evict` scenario uses four background tabs.
- **check-internals-boundary.sh:** no exemption was added. The boundary file is excluded from the scan, and `--catalogue` already covers its lines. An exemption would only weaken the guard. The task's hook is instead a self-test plant: the import plus the construction in any other shell file must be rejected, naming both patterns.
- **INTERNAL-APIS.md:** 4 rows (the import, the construction, the `Ci.` constant, and the `window.PopupNotifications` shim), not 1. They landed in Task 2 rather than Task 1, because the lines exist only from Task 2 and NG-040 direction 2 would have gone red.
- **Task 1 fixture seeding:** until Task 2 landed, the Task 1 self-test added a minimal correct copy of each absent piece in memory, with the panel built from upstream's own attributes. Task 2 deleted the seeds, so the same-session control is now the real tree.
- **Extra rules beyond the plan's five plants:** (f) no request kind in the section and (g) a display-only subscriber, with plants for an answering subscriber, an unaudited facade, a respelt module URL, and a section that serves a kind.
- **Live harness:** an offline `--self-test --static` mode was added, so the plants are audited without a binary. The live profile sets `security.notification_enable_delay` to 2000, so an early click lands inside the window on a slow host. `answerStock` reads the pref and never a literal.
- **Theia app bundle:** only `yarn build:extensions` ran (lane rule). The plan's `theia build --app-target=browser --mode development` belongs to the deferred live pass.

## Deferred to the end-of-milestone live pass

1. `node scripts/verify-prompts-live.mjs --scenario permission,answer-delay,background-queue,cancel-on-evict` against a built binary with the current patch 050. Not run: there is no objdir.
2. `node scripts/verify-prompts-live.mjs --self-test`: a clean control per target scenario and the 5 live plants (answer-dropped, delay-bypassed, queue-shown-early, activation-wrong-tab, evict-hangs). Not run.
3. The Theia app bundle build (`theia build --app-target=browser --mode development`) before that pass.
4. A visual check (KWin screenshot): the panel draws with stock styling, its arrow points at the strip above the page, and the tab strip's bell mark appears for a background tab. No BiDi assertion on `#notification-popup` exists or is planned.
5. Known gap to watch live: a permission request from the Theia frame itself (no tab id) takes the stock path. While an overlay is selected it counts as a background browser and does not show.

## Assumed cross-lane names

- **Phase 35 (35-02):** `installShellFurniture(window)`. The single bootstrap call `installPermissionPromptFurniture(window)` folds into it at merge. `scripts/verify-shell-furniture.mjs` receives rule (a) (#notification-popup vs upstream markup) at merge.
- **Phase 36 (36-01/36-02):** `webTabAdopt`, `adoptTab`, `dropAdoptedTab`, `installNewWindowReceivers(window)`, `adoptContentWindow`. None is used or added by this plan (they are first exercised in 37-04). None of the names matches the forbidden kind family, so `webTabAdopt` will pass rule (d) when it lands.

## Known Stubs

None. The pending mark is wired to the live push, and no placeholder data reaches the UI.

## Threat Flags

None outside the plan's threat model. The new `window.PopupNotifications` global and the `doorhanger` push are both the model's own surfaces (T-37-01-04/05), and both are catalogued and gated.

## Self-Check: PASSED

- FOUND: scripts/verify-permission-prompts.mjs, scripts/verify-prompts-live.mjs, the Phase 37 section in powerbrowser/shell/PowerBrowserAPI.sys.mjs, #notification-popup in powerbrowser/shell/powerbrowser.xhtml
- FOUND commits: 107a3c72, 30967ec6, 41b10ad7 (ancestors of HEAD; `git rev-list --count 23c08bb5..41b10ad7` = 3)
- Live proof: deferred, not claimed (see above)
