---
phase: 39-v1-5-close-out
plan: 06
subsystem: shell-furniture
tags: [saved-login, save-as, iframe, pointer-lock, harness, PROMPT-04, PROMPT-06]

requires:
  - phase: 39-v1-5-close-out
    provides: "39-02 --self-test --scenario; 39-05 the clipboard-cache image read and the ng-040 shift procedure"
provides:
  - "C23 fixed in the instrument: saved-login turns signon.rememberSignons back on (the BiDi remote agent sets it false)"
  - "CR-01 product fix: a save path for a spent save slot answers stale, so the menu-closed message is reachable"
  - "scenarios save-as-late, iframe-edit-rows, pointer-lock-warning"
  - "plants login-manager-disabled, save-reply-ttl, edit-rows-top-document, pointerlock-standin-missing"
affects: [39-07, 39-17, 39-18]

actuals:
  tokens: 36500
  tasks: 2
  commits: 6
plan_head_before: b89b947d4857724c6127e04b403adc19302ab1cf
plan_head_after: ce8623f37a5f24dad6427552c0ce2b66cac6b0c2

tech-stack:
  added: []
  patterns:
    - "Any login-manager check under WebDriver BiDi must set signon.rememberSignons=true: the remote agent's recommended prefs turn the login manager off"
    - "A right-click into an out-of-process iframe is dispatched in the frame's own BiDi context, in frame coordinates; input synthesized in the page's process stops at the <iframe> element"

key-files:
  created: []
  modified:
    - scripts/verify-page-furniture-live.mjs
    - powerbrowser/shell/PowerBrowserAPI.sys.mjs
    - powerbrowser/INTERNAL-APIS.md
    - .planning/ROADMAP.md
    - .planning/phases/35-shell-furniture-and-page-context-menu/35-UAT.md

key-decisions:
  - "C23 cause: WebDriver BiDi's recommended prefs (upstream remote/shared/RecommendedPreferences.sys.mjs:410) set signon.rememberSignons=false, so LoginHelper.enabled is false and LoginManagerChild never processes a login form. The product was correct; a stock window failed the same way in the same session"
  - "CR-01: the saveTargetExpired sentence was unreachable. A path reply with no save slot was a validation refusal, shown as the generic 'couldn't save' sentence. An earlier menu of this window (not the pending one) now answers stale; nothing is saved in either case"
  - "iframe-edit-rows uses a localhost iframe inside a 127.0.0.1 page, so the frame is another site and runs in another content process, the case CR-02 describes"

patterns-established:
  - "A plant for a defect whose state is module-private in the boundary gives the pre-fix answer at the frontend's send, and says so in its comment"

requirements-completed: [PROMPT-04, PROMPT-06]

duration: 35 min
completed: 2026-11-06
status: complete
---

# Phase 39 Plan 06: C23 saved-login popup and 35 T16-T18 live scenarios Summary

**C23 was the instrument: WebDriver BiDi's recommended prefs set `signon.rememberSignons=false`, so the login manager never processed the form. saved-login now turns it back on and passes. Three new scenarios prove 35-REVIEW CR-01, CR-02 and WR-03 live with plants. save-as-late found that the "menu had already closed" message could never be shown, and that is fixed in the product.**

## Performance

- Duration: about 35 min of execution (first commit 16:16Z, last code commit 16:29Z), plus gate runs
- Tasks: 2 of 2
- Live sessions: 3 C23 probe sessions (the four probes, then two follow-ups), 15 harness sessions (red and green runs, two self-tests with 4 and 1 plant sessions, one six-scenario run, one full furniture run). All headless. **Headed runs: 0.**

## C23: probes and cause (Task 1)

All probes ran from scratch scripts outside the repo (session scratchpad, `c23/probe*.mjs`). They printed booleans and counts only, and no password or log body. Nothing was added under `powerbrowser/`.

Session 1, with wrappers on `LoginManagerParent.prototype.receiveMessage`/`searchAutoCompleteEntries` and `AutoCompleteParent.prototype.receiveMessage`:

| Probe | Output |
|---|---|
| H1 `signon.debug` on, counting "Login already filled." / "Opening the autocomplete popup." through console-api-log-event and Services.console | filled 0, opening 0. The parent cannot see a content-process logger, so this probe could not observe the child. H2 settled the question instead |
| H2 parent message names and login result count | `PasswordManager:*` messages: **0** (not even `formProcessed`); `searchAutoCompleteEntries` calls: 0; after typing one character, `AutoComplete:StartSearch` providers `["FormHistory"]`, result `FormHistory:0` |
| H3 rejections of the parent query | none (0 errors) |
| H4 page origin equals the saved origin | true (page side), and the parent never ran a search to compare |

Follow-up 1: page `visibilityState` visible, `readyState` complete, `MozAfterPaint` count 1 then 5 (paints arrive). With `signon.testOnlyNotWaitForPaint=true`, still 0 `PasswordManager:*` messages. This rules out the paint/visibility deferral in `#handleEventOnceReady`.

Follow-up 2: overlay `isRemoteBrowser` true, `getActor('LoginManager')` ok, `formIsPending` false (no queued task). **A stock window (window.open from Theia), with the same login on the same origin in the same session, also showed no popup and sent 0 `PasswordManager:*` messages.**

**Cause:** the failure was not shell-specific, so I looked for a session-wide gate in `LoginManagerChild`. `#fetchLoginsFromParentAndFillForm` returns at `!LoginHelper.enabled` (`signon.rememberSignons`). Upstream's default is true (`all.js:2980`), but the WebDriver BiDi remote agent applies `remote/shared/RecommendedPreferences.sys.mjs:410` `["signon.rememberSignons", false]`. The harness's own `signon.autofillForms=false` (line 402 of the same list) was harmless. **The product was correct.** A user's session has no remote agent.

**Fix (f39f6e25):** saved-login sets `signon.rememberSignons` to true before the login page loads. After the fix, autocomplete and saved-login both PASS: the popup lists probe-user, and Down+Enter fills both fields (checked in the page, never printed).

**Plant (c8ea37ce):** `login-manager-disabled` sets the pref back to false after the scenario's setup and before the page loads, then reads it back. Red: `saved-login: FAIL -- no autocomplete popup opened on the username field`. Red before the fix, at c8ea37ce: the same line.

999.8 is ticked (`fixed in 39-06 (f39f6e25)`), and 35-UAT row 8 has a `live:` line. The time box ended with a verdict, so there is no WINDOWS.md entry.

## Scenarios for 35 T16-T18 (Task 2)

- **save-as-late (CR-01).** (1) Save Link As is answered 61 s after the pick: the file lands with the served bytes, a downloads row appears, and there is no failure sentence. (2) A second page menu opens while the first save's dialog waits. The dialog layer hides the page, so the scenario hides `.dialogOverlay` for that one right-click and then restores it. The first save still lands. (3) The same menu's save is answered a second time, so its one save slot is already spent: nothing is written, and `CHROME_BAR_COPY.saveTargetExpired` must show. The sentence comes from chrome-bar-copy.ts and the app name at check time, through the new `subjectCopy` helper, which `refusalLabel` now uses too.
  - Red before the fix (e7a851e0 on the old product): legs 1 and 2 passed, but leg 3 showed `"PowerBrowser couldn't save that file. Choose a different place and try again."`. A path with no slot was a `validation` refusal, so `saveTargetExpired` could never be shown, and the "next step" it gave (choose another place) would not help.
  - **Product fix (c77e2bd0):** `handlePageMenuAction` answers `{ ok: true, where: "stale" }` to a path for a menu this window issued (`0 < menuId <= nextMenuId`) that is not the pending menu and has no slot. Any other path is still refused as validation, and no save runs in either case (T-35-14 is unchanged). The edit adds 5 lines at 8682. INTERNAL-APIS.md references above 8682 were shifted by +5 with a script. `verify-ng-040 --fix` then printed nothing and changed nothing.
  - Plant `save-reply-ttl`: the old 60 s TTL lived in module-private state, so the plant returns the pre-fix chrome answer (`stale` for a path reply more than 60 s after its pick) at the frontend's `send`. Red: `a late Save As did not land: answered 61 s after the pick, no file or no downloads row`.
- **iframe-edit-rows (CR-02).** A `localhost` iframe inside a 127.0.0.1 page, so the frame is another site in another content process (the scenario prints `frame in another process`). The right-click is dispatched in the frame's own BiDi context: input synthesized in the page's process stopped at the `<iframe>` element, which gave a top-document menu with no This Frame row. With a selection in the frame's field, Cut, Copy, Paste, Delete and Select All are enabled. Copy copies "gamma", Paste and Undo act on the frame's second field, Select All selects the frame field's text, and Copy Image on the frame's image leaves an image flavour (read from the clipboard cache, as in menu-edit). Plant `edit-rows-top-document` sends every `ControllersParent` `isCommandEnabled`/`doCommand` to the top document's actor. Red: `edit rows followed the outer page, not the iframe: Cut, Copy, Paste, Delete not enabled ...`.
- **pointer-lock-warning (WR-03).** A button's `requestPointerLock` opens `#pointerlock-warning`. Its text must equal upstream's en-US `pointerlock-warning-domain`, read from browser.ftl at check time, with the page host filled in. An IP host keeps its port, as upstream `formatURIForDisplay` does, giving `"127.0.0.1:<port> has control of your pointer. Press Esc to take back control."`. `exitPointerLock` closes the warning. Locked from fullscreen, only `#fullscreen-warning` shows over 1 s of reads; the first leg is the positive control. Plant `pointerlock-standin-missing` deletes `window.PointerLock`. Red: `no pointer-lock warning while the page holds the pointer`.

35-UAT rows 16, 17 and 18 are `result: pass` with evidence naming the scenario, its plant and the commits. The Summary counts are now 8 passed and 9 pending.

## Verification

- `node scripts/verify-page-furniture-live.mjs --scenario autocomplete,saved-login`: autocomplete PASS, saved-login PASS
- `--self-test --scenario saved-login`: PASS, login-manager-disabled red
- `--scenario menu-save,save-as-late,menu-edit,iframe-edit-rows,element-fullscreen,pointer-lock-warning`: all 6 PASS
- `--self-test --scenario save-as-late,iframe-edit-rows,pointer-lock-warning`: PASS. Clean control green; save-reply-ttl, edit-rows-top-document and pointerlock-standin-missing red with their expected texts
- **Full furniture run, once: 22 of 22 PASS** (`context-menu timing: p50 99 p95 101 n=7`, `freeze-frame timing: menu p50 9 p95 12, still 20/20 within 50 ms`)
- `verify-ng-040-internals-catalogue-lines.mjs` PASS; `--fix` made no change; `check-internals-boundary.sh --catalogue` PASS for both files
- `! git grep -n -i 'signon.debug' -- powerbrowser/`: no match
- `nix develop .#theia --command bash scripts/diff-theia-core.sh`: `PASS -- zero changes inside @theia/*`. No Theia code changed, so no `yarn build`
- `scripts/verify-platform.sh --quick` (tracked tree, nothing unstaged of mine): `verify-platform: PASS -- all checks passed`

## Flake note (from 39-05)

The menu-edit Paste / menu-spelling flake after menu-page-tools' toolbox **did not occur**: the only full furniture run in this plan was 22 of 22 green, with menu-edit and menu-spelling run twice more in the six-scenario run and self-tests. With 1 full run, this says nothing about its rate. It stays with 39-18.

## Deviations from Plan

**1. [Rule 1 - Bug] CR-01's menu-closed message was unreachable**
- Found during: Task 2, save-as-late leg 3
- Issue: a path reply with no save slot was refused as `validation`, so `saveTargetExpired` never showed, and the generic failure's next step (choose another place) does not help.
- Fix: answer `stale` for an earlier, non-pending menu of this window. INTERNAL-APIS.md references shifted by +5.
- Files: powerbrowser/shell/PowerBrowserAPI.sys.mjs, powerbrowser/INTERNAL-APIS.md
- Commit: c77e2bd0

**2. [Instrument] The second-menu leg hides the dialog layer**
- A modal Theia dialog hides the overlay (`BLOCKING_LAYER_SELECTOR`), so a user in one shell window cannot right-click the page while a save dialog is open. The leg hides `.dialogOverlay` for one right-click so that `openPageMenu` runs while the save waits, which is the condition CR-01 names. It then restores the layer before answering.

**3. [Instrument] The save-reply-ttl plant works at the frontend's send**
- The pre-fix TTL was module-private state in the boundary, and a plant is a runtime mutation, never a file edit. So the plant returns the answer the pre-fix chrome gave, rather than re-arming the old chrome code.

**4. [Scope] E2 empty, partial and many-login states were not given legs**
- The plan's behavior section asks only for the saved-login fill. Zero logins, no-username rows, scrolling and ellipsis are stock PopupAutoComplete behavior with no shell code, so they were not asserted. Many and long are marked backstop in the plan.

## Known Stubs

None.

## Next Phase Readiness

- page-furniture-live is fully green (22 of 22) at this tree, and its self-test now has 32 plants.
- For any later harness touching the login manager (prompts, address-bar, Vaultwarden rows in 38): **set `signon.rememberSignons=true`**, because the BiDi remote agent turns it off.
- For any later iframe scenario: dispatch input in the frame's own BiDi context. Page-context input does not cross an out-of-process frame.
- PowerBrowserAPI.sys.mjs grew by 5 lines at 8682. Catalogue references are current.

## Commits

- c8ea37ce test(39-06): C23 plant login-manager-disabled, saved-login red before the fix
- f39f6e25 fix(39-06): C23 saved-login turns on the login manager the remote agent turns off
- 30be63b4 docs(39-06): C23 fixed in the instrument; 999.8 ticked, 35-UAT row 8 live line
- e7a851e0 test(39-06): scenarios save-as-late, iframe-edit-rows, pointer-lock-warning with plants
- c77e2bd0 fix(39-06): a save path for a spent save slot answers stale, so the menu-closed message shows
- ce8623f3 docs(39-06): 35-UAT rows 16, 17, 18 pass live with plants

## Self-Check: PASSED

All six commits are ancestors of HEAD (`git rev-list --count b89b947d..HEAD` = 6). The modified files exist. The PLANTS table has login-manager-disabled, save-reply-ttl, edit-rows-top-document and pointerlock-standin-missing. Nothing under powerbrowser/ carries a probe or `signon.debug`; the probes stayed in scratch scripts outside the repo.
