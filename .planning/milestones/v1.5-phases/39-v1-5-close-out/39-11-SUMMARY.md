---
phase: 39-v1-5-close-out
plan: 11
subsystem: testing
tags: [prompts-live, WR-01, WR-02, WR-03, WR-04, captures, kwin, registry, PROMPT-01, PROMPT-02, PROMPT-07, PROMPT-09]
status: complete

requires:
  - phase: 39-v1-5-close-out
    provides: "39-10 PROMPT-03 skip and the adopted-tab scenarios; 39-09 X11 sharing route and re-sited plants; 39-07 PB_CAPTURE_DIR pattern"
provides:
  - "scenarios pending-window-reports, nav-resets-sharing, dismissed-no-mark, popup-allow-opener, with one plant each"
  - "a per-session ROUTES table: sharing's X11 route; a one-second hang limit and no camera prompt for pending-window-reports"
  - "PB_CAPTURE_DIR hook: the headed capture of 37-T28..T32, with shell activation before stock answers"
  - "prompts-live and prompts-live-self-test green through the registry: 23 scenarios, 22 controls, 27 plants red, 2 skipped by derivation"
  - "37-UAT rows 17, 22-25 and 27 recorded pass; rows 28-32 carry capture lines and stay pending for Chris"
affects: [39-14, 39-18, 39-19]

tech-stack:
  added: []
  patterns:
    - "Hold an adoption ack from the frontend by wrapping WebTabChannel.request for one kind, inside chrome's 5 s fallback"
    - "Give a page its own content process by serving it from localhost instead of 127.0.0.1 (another site); a hang report names a process, and the stock match takes the first tab in it"
    - "A dismissed stock show is reached through upstream's own rule (a card-number login is captured dismissed), and the absence checks run only after the dismissed notification is read back"
    - "A headed run activates the shell before each stock answer: the stock buttons refuse a click while the window is inactive"

key-files:
  created:
    - .planning/phases/39-v1-5-close-out/39-11-SUMMARY.md
    - .planning/phases/39-v1-5-close-out/captures/37-T28-doorhanger.png
    - .planning/phases/39-v1-5-close-out/captures/37-T29-strip-mark.png
    - .planning/phases/39-v1-5-close-out/captures/37-T30-sharing-indicator.png
    - .planning/phases/39-v1-5-close-out/captures/37-T31-device-and-password-doorhangers.png
    - .planning/phases/39-v1-5-close-out/captures/37-T32-notification-bars.png
  modified:
    - scripts/verify-prompts-live.mjs
    - .planning/phases/37-permission-prompts-and-dialogs/37-UAT.md

key-decisions:
  - "WR-03 is driven through the dismissed password capture, not the notification post-prompt. In the shell the post-prompt throws before its show (PermissionUI.sys.mjs:664 reads an anchor icon the shell lacks), so nothing reaches the show wrapper. An unchanged login shows no stock notification at all. The cap leg orders the dismissed capture before three real prompts: counted, it would be the oldest record and be evicted"
  - "The pending page is served from localhost so its hang report is attributable to it. With every fixture on 127.0.0.1, the report went to the opener tab, the first tab in the shared content process. That is upstream's process-level match, not a pending-window defect"
  - "The pending session sets media.navigator.permission.disabled, so the camera starts at load with no prompt, as a site with a remembered grant would. A harness-written camera permission still prompted"
  - "The WR-02 plant drops the all-off sharingChanged push at the frame's group actor. resetWebTabSharing is a module-internal call that no chrome-scope code can reach, so this is the nearest runtime re-creation of 'the reset never reaches Theia'"
  - "T30 is captured in pending-window-reports, where the camera needs no stock Allow, because headed stock answers depend on window activation on the owner's desktop"
  - "No requirement row was marked complete. The orchestrator owns requirement and STATE progress at merge, and PROMPT-01/02 stay Pending until the milestone close"

requirements-completed: []

actuals:
  tokens: 24000
  tasks: 3
  commits: 3
plan_head_before: 3a64a26cfb477772933ae6670098e9d581974a5c
plan_head_after: 9e45d61f757e15938a690ca8b8427673078662f7

duration: 150 min
completed: 2026-11-06
---

# Phase 39 Plan 11: WR-01..WR-04 scenarios, the capture hook, and prompts-live through the registry Summary

**Four review fixes that had no live proof now have live scenarios, and each has a plant that re-creates the reviewed defect and goes red:**
- WR-01: reports that arrive before the adoption ack
- WR-02: a navigation resets the sharing marks
- WR-03: a dismissed prompt leaves no mark
- WR-04: Allow on a blocked popup keeps `window.opener`

Both `prompts-live` registry rows pass. `prompts-live` runs 23 scenarios with dialog and dialog-probe skipped by derivation. The self-test runs 22 controls and 27 plants, all red. The five visual-row captures are committed for Chris.

## Performance

- Duration: about 150 min. About 60 min of that was registry and `--quick` wall time while lane B ran alongside.
- Tasks: 3 of 3
- **Headed runs: 5, all under `flock /tmp/nix-shell.75PsxP/pb-headed.lock`, sandbox off:**
  - Two capture runs whose captures were replaced.
  - One debug run of a headed camera grant.
  - The capture run from a scratch copy with the activation fix.
  - The final capture run from the tree. All four of its scenarios passed headed.
- Headless sessions: about 90, which includes the full registry self-test (51 sessions).

## Task 1: pending-window-reports and nav-resets-sharing (c2a11c29)

```
pending-window-reports: PASS
nav-resets-sharing: PASS
  ok  pending-report-dropped -> red, naming 'a report made before the adoption ack was lost'
  ok  nav-reset-dropped -> red, naming 'navigation left a sharing mark on'
```

## Task 2: dismissed-no-mark, popup-allow-opener, PB_CAPTURE_DIR (ad800eab)

```
dismissed-no-mark: PASS
popup-allow-opener: PASS
  ok  dismissed-recorded -> red, naming 'a dismissed prompt left a pending mark'
  ok  allow-drops-opener -> red, naming 'Allow lost window.opener'
```
`grep -c PB_CAPTURE_DIR scripts/verify-prompts-live.mjs` prints 3 or more.

## Task 3: registry rows, captures, 37-UAT (9e45d61f plus the docs commit)

The precondition held: `sha256sum -c objdir/.pb-050-build.sha256` printed OK.

The `scripts/verify-platform.sh --only prompts-live` log (`/tmp/nix-shell.75PsxP/pb-39-11/prompts-live.log`):
```
dialog-probe: SKIPPED (PROMPT-03 deferred, 999.3)
dialog: SKIPPED (PROMPT-03 deferred, 999.3)
permission: PASS ... (23 scenarios, all PASS)
  prompts-live: PASS
```
The `--only prompts-live-self-test` log (`.../prompts-live-self-test.log`):
```
  ok  static: 29 plants ...; deferral-record-removed and deferral-row-removed -> the PROMPT-03 skip no longer applies
dialog-probe: SKIPPED (PROMPT-03 deferred, 999.3)
dialog: SKIPPED (PROMPT-03 deferred, 999.3)
  22 x ok  clean control ... -> green
  27 x ok  <plant> -> red, naming '<expect>'
prompts-live --self-test: PASS -- clean controls green, 27 planted faults went red (2 plant(s) of dialog-probe, dialog not run: PROMPT-03 deferred)
  prompts-live-self-test: PASS
```
Neither run hit a flake. The 39-18 flakes (menu-edit Paste and the others) are in other harnesses.

**Captures:** `PB_CAPTURE_DIR=.planning/phases/39-v1-5-close-out/captures node scripts/verify-prompts-live.mjs --scenario permission,background-queue,password-save,pending-window-reports`. I opened all five PNGs. Each is 1600x1000 and shows only the PowerBrowser window.
- **T28 (doorhanger) and T31 (device and password doorhangers):** the stock panel is not in the window capture. Chrome's panel state was `open`, but the PNG shows the tab's bell mark and the page only. Chris must look at both live.
- **T29:** the bell mark on the backgrounded tab.
- **T30:** the camera mark in the chrome bar.
- **T32:** the three bar kinds stacked inside the web tab widget, with no overlap.
- **Observation for Chris (rows 28, 30, 32):** on the adopted tab whose location prompt arrived before the ack, the prompt's text ("Allow localhost:… to access your location? Learn more / Remember this decision / Block Allow") renders unstyled at the window's top-left, over the tab strip, with no panel frame. It appears only in the headed capture; the headless anchor check (`anchorInBar`) passes. This is recorded on the rows. It is not diagnosed.

**37-UAT:**
- Row 17: pass.
- Row 27: pass, with the four named plant lines.
- Rows 22 to 25: pass. The evidence names the scenario, the plant and the commit.
- Rows 28 to 32 stay `[pending]`, each with a `capture:` line.
- Summary counts: passed 35, pending 5, skipped 1 (row 9, PROMPT-03).

The plan's automated verify passed, including `37-UAT ok` and `5 captures`.

## Verification

- `scripts/verify-platform.sh --quick`, inside `nix develop .#theia`, was run after staging and before each of the three task commits. It printed `verify-platform: PASS -- all checks passed` all three times.
- `node scripts/verify-prompts-live.mjs --self-test --static`: PASS, 29 plants.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Headed stock answers failed at random in a capture run**
- **Found during:** Task 3, the first capture run (permission, background-queue, camera-then-geo and password-save were red headed)
- **Issue:** `PopupNotifications._onButtonEvent` refuses a click while the window is not the active window: "Button click happened before the window was focused / active". On the owner's desktop, the shell is not always active.
- **Fix:** In a capture run only, `activateShell` raises the shell through pb-kwin and reads `Services.focus.activeWindow === window` back before each stock answer and before each doorhanger capture. Headless runs are unchanged.
- **Commit:** 9e45d61f

**2. [Rule 1 - Bug] openPage found the wrong tab's BiDi context for two tabs on the same URL**
- **Fix:** The second login tab uses `/login?tab=2`.
- **Commit:** ad800eab

**3. [Rule 3 - Blocking] Hang report attribution, and the camera prompt, in the pending window.** See the key decisions above.
- **Commit:** c2a11c29

**4. [Scope] The capture command list differs from the plan's.** The run used permission, background-queue, password-save and pending-window-reports. The visual states live in those scenarios, and the plan's list (sharing, camera-doorhanger, popup-block, hung-script, protocol-handler) holds no capture call. Headed sharing is still red on its camera leg, as 39-09 found.

## Product fix deferred to main

**1. The notification post-prompt throws in the shell (low severity, user-invisible)**
- **Red evidence:** a gesture-less `Notification.requestPermission()` with `dom.webnotifications.requireuserinteraction` true logs this, read from `Services.console` in a dismissed-no-mark debug session:
  ```
  TypeError: can't access property "addEventListener", anchor is null
    postPrompt@resource:///modules/PermissionUI.sys.mjs:664
  ```
- **Cause:** `postPrompt()` reads `document.getElementById(this.anchorID)` (`web-notifications-notification-icon`) for its animation unless `window.gReduceMotion` is truthy. The shell has neither, so the stock dismissed post-prompt is never shown. The page still gets its denial.
- **Fix I would make:** in `powerbrowser/shell/PowerBrowserAPI.sys.mjs` `installPermissionPromptFurniture`, beside the `window.ConfirmationHint = { show() {} }` stand-in, add `window.gReduceMotion = true; // PermissionUI.postPrompt animates an anchor icon the shell does not have (iconBox null)`. The alternative is a hidden `#web-notifications-notification-icon` in `powerbrowser.xhtml`. Either one needs an INTERNAL-APIS.md row, and needs the facade audit (`verify-shell-gbrowser-standin` / furniture rules) checked.
- **After the fix:** the dismissed post-prompt takes the WR-03 stock path and makes no record. The dismissed-no-mark scenario could then add a notification leg.
- **UAT impact:** none. Row 24 passes on the password leg and names this gap.

**2. Not a fix, an observation:** the unstyled location-prompt rendering in the headed captures (rows 28, 30 and 32). It has no root cause yet. Chris's live look decides whether it is a defect.

## Known Stubs

None.

## Threat Flags

None.
- T-39-27 is mitigated: dismissed-no-mark has a positive control, and its plant is red.
- T-39-28 is mitigated: captureShell's active-window gate, and every PNG was opened. T31 shows the harness's test-only login values in the URL bar (`pb-login-user`, `pb-login-pass-1`), which are never a real account.
- T-39-29 is mitigated: every pass cites the scenario, the plant and the commit.

## Notes for later plans

- **39-14 / the gate:** `prompts-live` is green by derivation (ledger 26 open) and no longer needs a `GATE_KNOWN_OPEN_EXCLUSIONS` row.
- **39-19 (human checklist):** rows 28 to 32 need a live look. T28 and T31 have no panel in their capture. Rows 30 and 32 cover the dark theme only. The unstyled prompt text is the thing to check.
- **The registry rows take about 7 min** (prompts-live) **and about 25 min** (prompts-live-self-test) on this host.

## Self-Check: PASSED

- FOUND: the five captures/37-T28..T32 PNGs, scripts/verify-prompts-live.mjs with the four new scenarios and PB_CAPTURE_DIR
- FOUND commits: c2a11c29, ad800eab, 9e45d61f (ancestors of HEAD)
