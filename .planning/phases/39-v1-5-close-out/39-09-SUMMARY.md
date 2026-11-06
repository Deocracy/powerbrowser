---
phase: 39-v1-5-close-out
plan: 09
subsystem: testing
tags: [prompts-live, kwin, spectacle, screen-share, x11, harness, 999.12, 999.13, 999.14, PROMPT-01, PROMPT-02]

requires:
  - phase: 39-v1-5-close-out
    provides: "39-01 pb-kwin captureShell/activeWindow; 39-BASELINE rows prompts-live (sharing) and prompts-live-self-test (listed:999.12), owned by 39-09"
provides:
  - "kwinShot through pb-kwin captureShell with a PNG size check against frame x output scale (999.14)"
  - "pb-kwin: activeWindow reports the output devicePixelRatio; captureShell passes spectacle -S (no drop shadow)"
  - "queue-shown-early and activation-wrong-tab read inPanel back; camera-doorhanger checks the template's own markup first (999.13)"
  - "sharing session on the X11 capture route: allow-pipewire=false plus MOZ_ENABLE_WAYLAND=0, GDK_BACKEND=x11, XDG_SESSION_TYPE=x11 (999.12)"
  - "window-only dialog-probe evidence PNGs; verdict unchanged"
affects: [39-10, 39-11, 39-18, 39-19]

actuals:
  tokens: 9000
  tasks: 2
  commits: 3
plan_head_before: edddbbcf4dc71a9c59a667501363afb437e1302d
plan_head_after: d891dbe79a651d44e192500b6393c2d5310613d7

tech-stack:
  added: []
  patterns:
    - "A window capture is checked against KWin's frameGeometry times the output's devicePixelRatio, with spectacle -S so the drop shadow does not pad the PNG"
    - "A plant that drives an async stock UI (PopupNotifications._update opens the panel after _hidePanel resolves) reads the result back before the scenario checks it, and reports BROKEN if it never took effect"
    - "A per-scenario session route (prefs plus process env) is applied in runSession and the env is restored in finally"

key-files:
  created:
    - .planning/phases/39-v1-5-close-out/39-09-SUMMARY.md
  modified:
    - scripts/verify-prompts-live.mjs
    - scripts/lib/pb-kwin.mjs
    - .planning/probes/prompt-probe-verdict.json
    - .planning/probes/prompt-probe/dialog-{alert,confirm,prompt,leave,auth}.png
    - .planning/probes/prompt-probe/push-log.json
    - .planning/phases/37-permission-prompts-and-dialogs/37-UAT.md
    - .planning/ROADMAP.md

key-decisions:
  - "A2 holds only with XDG_SESSION_TYPE=x11 added to the route: libwebrtc builds the X11 screen capturer only when DesktopCapturer::IsRunningUnderWayland() is false, and that reads XDG_SESSION_TYPE and WAYLAND_DISPLAY. With the pref and MOZ_ENABLE_WAYLAND/GDK_BACKEND alone, getDisplayMedia rejected with NotFoundError"
  - "kwinShot is a no-op unless PB_LIVE_HEADED=1. A headless session has no shell window, and the raise must never pick up a PowerBrowser the owner has open"
  - "camera-template-missing: PopupNotifications creates an ad-hoc popupnotification under the same id when the template is gone, so the panel opening proves nothing. The scenario now checks for the template's own device menulist before it reads the menulist's items. The plant and its expect string are unchanged"
  - "allow-loads-frame-url needed no change: it went red naming its own expect in 3 of 3 runs on this tree. The 2026-11-04 'not adopted next to its opener' result did not reproduce"

requirements-completed: []  # PROMPT-01/02 live halves proven here; rows left Pending for the milestone close (portal click still human)

duration: 50 min
completed: 2026-11-06
status: complete
---

# Phase 39 Plan 09: Prompts harness 999.14, 999.13, 999.12 (X11 sharing route) Summary

**Probe captures are now PowerBrowser-window-only PNGs, size-checked against KWin's frame geometry at the output scale. The four prompts plants reach their own failures. Screen sharing passes live with no KDE portal chooser through an X11 capture route that the harness sets for the sharing session only.**

## Performance

- Duration: about 50 min (2026-11-06 13:28 to 14:20 PST)
- Tasks: 2 of 2
- Live sessions: 37 headless (self-tests and sharing probes), plus 4 headed
- **Headed runs: 4.** (1) The first dialog-probe run. Every capture was rejected because spectacle -a includes the drop shadow, which is how the shadow was found. (2) A scratch captureShell probe, which measured the shadow and the 1.25 scale. (3) The dialog-probe evidence run. (4) One headed sharing run while debugging A2; see Issues.

## Task 1: 999.14 and 999.13 (fae88df5, ticks 5ab01823)

- **kwinShot** now awaits `captureShell(out)` from `scripts/lib/pb-kwin.mjs` and reads the PNG IHDR. It returns the path only when width and height equal `frame x scale` within 2 px. A mismatched capture is deleted. A refused one returns null, and the existing BROKEN lines report it. `grep -c "'spectacle'" scripts/verify-prompts-live.mjs` prints 0.
- **pb-kwin** (deviation, Rule 3): `activeWindow` adds `scale` (the output's `devicePixelRatio`), and `captureShell` passes `-S`. Measured on the owner's desktop: the frame is 1280x800 and the scale is 1.25. Without `-S`, the PNG was 1665x1065 because of the shadow margin. With it, the PNG is 1600x1000, an exact match.
- **Evidence:** a headed `--scenario dialog-probe` re-captured the five PNGs in `.planning/probes/prompt-probe/`, each 1600x1000. I opened every one, and each shows only the PowerBrowser window (tab strip, chrome bar, page). The verdict is unchanged: `stock-blocks-ide`, with the same five blocked kinds. Only the date and the Theia bundle hash changed.
- **queue-shown-early / activation-wrong-tab:** the stock panel opens asynchronously (`_showPanel` runs inside `_hidePanel().then`), so the old plant read `inPanel` before the popup opened. `showQueuedNow` now waits up to 5 s for `inPanel`. If the panel never opens, the scenario returns a BROKEN line naming the plant.
- **camera-template-missing:** the scenario's first check now also requires the panel's `webRTC-shareDevices-notification` element to carry `#webRTC-selectCamera-menulist`. Without that check, the ad-hoc element passed it.
- **allow-loads-frame-url:** unchanged; already red naming its own expect.

Verification (`--self-test --scenario background-queue,camera-doorhanger,popup-block`, headless):
```
  ok  clean control for background-queue -> green
  ok  clean control for camera-doorhanger -> green
  ok  clean control for popup-block -> green
  ok  queue-shown-early -> red, naming 'panel shown for a backgrounded tab'
  ok  activation-wrong-tab -> red, naming 'queued record shown for the wrong tab'
  ok  camera-template-missing -> red, naming 'camera template missing: request never resolved'
  ok  allow-loads-frame-url -> red, naming 'Allow opened a frame-supplied URL'
  ok  bar-covers-page -> red, naming 'bar covers page content'
  ok  adopt-next-to-opener-failed -> red, naming 'popup not adopted next to its opener'
prompts-live --self-test: PASS -- clean controls green, 6 planted faults went red
```
No PLANTS `expect:` value changed (`git diff` shows no `expect:` line).

## Task 2: 999.12 (d891dbe7, records in the docs commit)

- **A2 verdict: holds, with one more env var than RESEARCH named.** The first probe used the pref plus `MOZ_ENABLE_WAYLAND=0 GDK_BACKEND=x11`. It failed with "no stock doorhanger with a window or screen to pick", and the page saw `NotFoundError`. Cause: `screen_capturer_linux.cc` creates `ScreenCapturerX11` only when `!DesktopCapturer::IsRunningUnderWayland()`, and that function reads `XDG_SESSION_TYPE` and `WAYLAND_DISPLAY`. Adding `XDG_SESSION_TYPE=x11` made sharing PASS headless, with no portal.
- `runSession` applies `X11_CAPTURE` (prefs and env) only for `sharing` and restores `process.env` in `finally`. `staticAudit` derives `media.webrtc.capture.allow-pipewire` from StaticPrefList.yaml and the `getenv("XDG_SESSION_TYPE")` read from desktop_capturer.cc.
- `node scripts/verify-prompts-live.mjs --scenario sharing` → `sharing: PASS`
- `--self-test --scenario sharing` → control green; `sharing-stuck-on` and `frame-flag-accepted` red as named; PASS.
- **Records:**
  - 37-UAT row 6: `result: pass`. Its evidence names the X11 route, and a `human:` line holds the "37 T6 portal click".
  - Row 33: `result: pass`, with window-capture evidence.
  - Row 17 stays skipped for 39-11's full self-test.
  - Summary counts: passed 23, skipped 3.
  - Backlog 999.12 is ticked `fixed in 39-09 (d891dbe7)`.

## Verification

- `scripts/verify-platform.sh --quick` after staging: `verify-platform: PASS -- all checks passed`, at Task 1 and again with the records staged. diff-theia-core and the internals boundary are part of `--quick`. No Theia or shell code changed, so `yarn build` and `-purgecaches` were not needed.
- Task 1 and Task 2 automated verify commands: both pass (outputs above).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] spectacle's drop shadow and the display scale made the plan's frame-size check unsatisfiable**
- **Found during:** Task 1, the first headed dialog-probe run (every capture rejected)
- **Fix:** `captureShell` passes `-S`; `activeWindow` reports `scale`; kwinShot compares against `frame x scale`
- **Files:** scripts/lib/pb-kwin.mjs, scripts/verify-prompts-live.mjs
- **Commit:** fae88df5

**2. [Rule 1 - Bug] The first kwinShot deleted the committed evidence PNGs on a refusal**
- **Found during:** Task 1. The rejected run removed the tracked PNGs.
- **Fix:** I restored them with `git checkout -- .planning/probes/prompt-probe/`. kwinShot now deletes only a capture it has just written whose size does not match, and leaves the file alone when the capture is refused.
- **Commit:** fae88df5

**3. [Rule 3 - Blocking] The X11 route needed XDG_SESSION_TYPE=x11** (see A2 verdict above)
- **Commit:** d891dbe7

**4. [Rule 2 - Safety] kwinShot does nothing in a headless session**, so a headless run never raises or captures a PowerBrowser window the owner has open. Commit fae88df5.

## Issues for later plans

- **39-10:** with kwinShot gated, a **headless** `dialog-probe` now returns `broken instrument: no KWin screenshot ... no verdict written` rather than `FAIL -- stock dialog blocks the IDE`. Before, it took full-desktop shots. `dialog` is unaffected, because its shot check comes after the blocked check. The planned PROMPT-03 skip covers both scenarios. If the verdict is to be rewritten, run it headed: `PB_LIVE_HEADED=1 node scripts/verify-prompts-live.mjs --scenario dialog-probe` with the sandbox off.
- **Headed sharing is red on a different leg:** one headed run (PB_LIVE_HEADED=1 with the X11 env, shell window on XWayland) failed at `camera and microphone were not granted through the stock Allow`. The headless route (the registry's mode) passes. I did not investigate. The registry rows are headless, so nothing depends on it now.
- The stock commonDialog is a separate window, so the shell capture in Test 33 shows the IDE without the dialog over it. Whether the IDE was interactive is still read from `inputEnabled` in the verdict, as the row says.
- Flakes owned by 39-18: none hit in any run here.

## Known Stubs

None.

## Threat Flags

None. T-39-21 is mitigated: the gate on the powerbrowser class, `spectacle -a -S`, the size check with deletion on mismatch, and the headless no-op. I opened every committed PNG before committing it. T-39-22 is accepted: the X11 stream stays inside the local test page and is never written to disk.

## Commits

- fae88df5 fix(39-09): 999.14 kwinShot through captureShell; 999.13 plants reach their own failures
- 5ab01823 docs(39-09): tick backlog 999.13 and 999.14
- d891dbe7 fix(39-09): 999.12 sharing runs on the X11 capture route, no portal chooser
- (final docs commit, after plan_head_after) 37-UAT rows 6 and 33, 999.12 tick, this summary, STATE and ROADMAP progress

## Self-Check: PASSED

Commits fae88df5, 5ab01823 and d891dbe7 are ancestors of HEAD. scripts/verify-prompts-live.mjs, scripts/lib/pb-kwin.mjs and this summary exist.
