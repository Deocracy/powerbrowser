# Phase 39 human-only checklist (v1.5 close-out)

Status: deferred by Chris 2026-11-07 via AskUserQuestion ("Defer: record all as pending, continue"); work through with /gsd-verify-work <phase>

Internal document for Chris; identifiers allowed. Written 2026-11-07 by plan 39-20 Task 2.

Source: every `[pending]` row in the `## Tests` sections of the nine UAT files (27, 31.1, 32-38). The plan-39-20 verify
derives that set again from the UAT files and fails if a row is missing here. All captures are under
.planning/phases/39-v1-5-close-out/captures/. Run the binary as `objdir/dist/bin/powerbrowser -purgecaches`.

Live halves are already recorded on each row (`live:` / `evidence:`), so each item below asks only for what a person
has to judge. The gate result and the 32 excluded reds, each with its ledger id, are in 39-BASELINE.md `## Final run`.
The requirement rows each item blocks are in 39-20-DECISIONS.md.

## Phase 27

- [ ] 27 T5 Look and timing — judge: one-line tooltips above the bar in Coding and Browsing and on the toolbar row in Organising, never over the page; a ~500 ms hold on Back opens the history menu as Firefox does; narrowing the window with Home shown shrinks the address pill to 120px before any button wraps or clips — capture: none (look on the machine) — source: .planning/phases/27-groundwork-navigation-buttons-and-page-focus-keys/27-UAT.md
  - Related open ledger entry 27 (39-15): after a real hold on Back is released on the pill, focus is in the pill, so a real Escape leaves the history menu open.
- [ ] 27 T6 Real drag onto New Tab — judge: dragging a link from another application shows the ring and opens one focused web tab; a javascript: or file: drop opens nothing — capture: none (cross-application drag, see Portal and cross-application) — source: .planning/phases/27-groundwork-navigation-buttons-and-page-focus-keys/27-UAT.md

## Phase 31.1

No `[pending]` rows (T1 pass; T2 and T3 owner decisions answered 2026-11-06).

## Phase 32

- [ ] 32 T1 Crashed tab — crash UI look — judge: the crash copy and the Reload tab button sit in place of the page and look right; the strip's crashed mark reads correctly (behaviour passed live in 39-16) — capture: captures/32-T1-crash-ui.png — source: .planning/phases/32-page-tools/32-UAT.md
- [ ] 32 T2 Reader view toggle in the light theme and in the dark theme — judge: reader view is legible in both themes — capture: captures/32-T2-reader-light.png, captures/32-T2-reader-dark.png — source: .planning/phases/32-page-tools/32-UAT.md
  - Finding from 39-16: under the light Theia theme the chrome bar, the tab strip and the reader toggle keep their dark palette, so the two captures differ only in the page scrollbar. Decide whether the bar should follow the Theia theme.
- [ ] 32 T3 Favicons at 16px on the Browsing-mode strip and the Tabs-mode pill rows — judge: the site icon is crisp at 16px on the strip row and the Tabs-mode pill row (dock-bar scope already ruled: keep as is, backlog 999.18) — capture: captures/32-T3-favicons.png — source: .planning/phases/32-page-tools/32-UAT.md
- [ ] 32 T4 DevTools toolbox window (F12) — judge: the toolbox window looks like a stock DevTools window (one per page, closes with the tab; behaviour passed live) — capture: captures/32-T4-devtools-toolbox.png — source: .planning/phases/32-page-tools/32-UAT.md
- [ ] 32 T5 Downloads button and panel on screen; Open and Show in folder — judge: start a page download and open the Downloads button. Open launches the file with the OS handler; Show in folder opens the file manager on it; arrow keys move between rows; Esc closes the panel and returns focus to the page; the badge clears for finished rows once the panel opens. PAGE-06 stays Pending until this passes — capture: none (on the machine; the OS handler and the file manager are other applications) — source: .planning/phases/32-page-tools/32-UAT.md
- [ ] 32 T6 Find strip layout, toggles, and F3 on a closed bar — judge: the 32px strip sits under the bar and the page moves down by its height, nothing covers the page; clicking Match case and Whole words changes the count (not clicked on screen by the harness) — capture: captures/32-T6-find-strip.png — source: .planning/phases/32-page-tools/32-UAT.md

## Phase 33

- [ ] 33 T7 Visual and copy pass against 33-UI-SPEC — judge: star 3px inset and editor anchor; 28px toolbar row; 32px History rows; 320px clear panel with danger ink on Clear only; 280px hamburger geometry (the copy strings, the 300 ms submenu delay, Edit placement and the Settings command were already accepted on 2026-11-05) — capture: captures/33-T7-hamburger.png, captures/33-T7-history-rows.png, captures/33-T7-star-editor.png, captures/33-T7-bookmarks-toolbar.png, captures/33-T7-clear-panel.png — source: .planning/phases/33-bookmarks-history-and-the-full-menu/33-UAT.md
  - Finding from 39-16: in the star editor the "Remove bookmark" label wraps onto two lines and overflows its button (33-T7-star-editor.png).
  - Finding from 39-16: History > Recent pages lists the same page twice, as "http://127.0.0.1:<port>/find - PowerBrowser" and as "Find fixture" (33-T7-history-rows.png).

## Phase 34

- [ ] 34 T7 Link dropped on the strip (TAB-08) — judge: a URL dragged from outside the browser and a file dropped on the strip: http(s) opens a background tab at the drop position; a file shows the strip's refusal sentence and loads nothing (the in-browser drops passed live) — capture: none (cross-application drag, see Portal and cross-application) — source: .planning/phases/34-tab-strip/34-UAT.md
- [ ] 34 T14 Pinned-tab corner badge fit and selected-tab styling — judge: the 10px audio badge sits inside the 32px pinned tab and stays clickable; the active tab inside a selection stays distinguishable; selected tabs show hover feedback (IN-01 is open, so they may not). In the capture /a is pinned and marked playing, /b is current, /c and /d are selected, and /c's preview card is open — capture: captures/34-T14-badge-and-selection.png — source: .planning/phases/34-tab-strip/34-UAT.md

## Phase 35

- [ ] 35 T2 Full driver — judge: confirm from the record that the row is met. `scripts/verify-platform.sh` and `--gate` include page-furniture-live and page-furniture-live-self-test, and both passed in the 77e5d037 `--gate` run (39-BASELINE.md `## Final run`; the self-test was red once in the 6ac27ac2 full run, ledger 43 flake). Nothing needs to be looked at on screen — capture: none — source: .planning/phases/35-shell-furniture-and-page-context-menu/35-UAT.md
- [ ] 35 T4 ROADMAP research probe 8, G4b freeze-frame latency — judge: the timing half passed (p50 7 ms, p95 9 ms, 20/20 stills within 50 ms). Still open: with a Phase 37 notification bar showing, open the page menu and check whether the freeze-frame still covers the bar or is stretched (35-REVIEW IN-05) — capture: none (on the machine) — source: .planning/phases/35-shell-furniture-and-page-context-menu/35-UAT.md
- [ ] 35 T12 Visual: menu look and order against the stock window — judge: the page menu matches the stock window's page menu in order, separators and labels, side by side (no scenario opens the stock window's menu) — capture: captures/35-T12-menu.png (shell half only) — source: .planning/phases/35-shell-furniture-and-page-context-menu/35-UAT.md
- [ ] 35 T13 Visual: tooltip placement at the window edge — judge: a `title=` element near the right and bottom window edge shows its tooltip clamped inside the window — capture: captures/35-T13-tooltip-edge.png — source: .planning/phases/35-shell-furniture-and-page-context-menu/35-UAT.md
- [ ] 35 T14 Visual: fullscreen warning banner — judge: stock XUL rendering of the warning banner, readable over video, with the exit button — capture: captures/35-T14-fullscreen-warning.png — source: .planning/phases/35-shell-furniture-and-page-context-menu/35-UAT.md
  - Note from 39-07: the capture shows the banner over the IDE layout with an empty main area, not over the video, although element-fullscreen had just read overlayFull and windowFull as true. This is either the overlay not painting over the Theia frame in a headed fullscreen window or a capture artefact. A live look on the machine decides which.
- [ ] 35 T15 Visual: status-line truncation — judge: a long link URL shows one truncated line, with the full URL in `aria-label` — capture: captures/35-T15-status-truncation.png — source: .planning/phases/35-shell-furniture-and-page-context-menu/35-UAT.md

## Phase 36

- [ ] 36 T17 VB-01: an adopted tab looks like a normal web tab — judge: no pending flash or spinner, and title parity with a tab opened from the strip, against 36-UI-SPEC VB-01; favicon, F12 and prompts on an adopted tab (37 T20 has since proved favicon, F12 and tabs.query live, so the look is what is left) — capture: captures/36-T17-adopted-tab.png — source: .planning/phases/36-new-window-links-as-web-tabs/36-UAT.md

## Phase 37

- [ ] 37 T28 Doorhanger placement and keyboard (KDE Wayland) — judge: the native panel opens over the page's top-left corner just under the chrome bar, above the Theia frame, with its stock Allow, Block and Remember controls; Tab and Enter operate it; Esc dismisses it; it follows a window resize and a move; nothing overlays it. The capture does not contain the stock panel (window capture), so this needs a live look — capture: captures/37-T28-doorhanger.png (bell mark and page only) — source: .planning/phases/37-permission-prompts-and-dialogs/37-UAT.md
  - Note from 39-11 (also in 37-T30 and 37-T32): on an adopted tab whose prompt arrived before the ack, the location prompt's text renders unstyled at the window's top-left over the tab strip, with no panel frame or background.
- [ ] 37 T29 Pending-prompt mark in the tab strip — judge: a background tab with a waiting prompt shows the bell mark and its tooltip in both themes (the capture is dark only); the mark clears when the prompt is answered or the page navigates; IN-03: the copy says "permission" even for a password offer — capture: captures/37-T29-strip-mark.png — source: .planning/phases/37-permission-prompts-and-dialogs/37-UAT.md
- [ ] 37 T30 Sharing indicator in the chrome bar — judge: one mark per shared kind (camera, microphone, screen), legible in light and dark, with the tooltip "{App} is sharing your camera with this tab." and its siblings; no mark for a tab that shares nothing (the capture is camera only, dark only) — capture: captures/37-T30-sharing-indicator.png — source: .planning/phases/37-permission-prompts-and-dialogs/37-UAT.md
- [ ] 37 T31 WebRTC device doorhanger and password doorhanger — judge: the device menulists and the camera preview lay out correctly in the native panel; the password doorhanger shows both fields, the username field is upgraded, and the autocomplete panel opens. The stock panel is not in the window capture, so this needs a live look — capture: captures/37-T31-device-and-password-doorhangers.png (bell mark only) — source: .planning/phases/37-permission-prompts-and-dialogs/37-UAT.md
- [ ] 37 T32 Notification bars — judge: the blocked-popup, hung-script and protocol-handler bars sit inside the web tab widget and shrink the page rect (never cover content), read correctly in both themes (the capture is dark only), and do not overlap when stacked; does "Stop script" read as destructive? — capture: captures/37-T32-notification-bars.png — source: .planning/phases/37-permission-prompts-and-dialogs/37-UAT.md

## Phase 38

- [ ] 38 T18 Visual: buttons, badge, puzzle menu, popup arrow (KDE Wayland) — judge: 28x28 buttons; the badge at the button's corner, capped at four characters; the 300px puzzle menu with icon, name, Pin to Toolbar, Manage Extension and Remove Extension rows; the native panel's arrow under the clicked button (no popup is open in the capture); legible in both themes — capture: captures/38-T18-buttons-badge-puzzle-popup.png — source: .planning/phases/38-webextensions/38-UAT.md
- [ ] 38 T19 Visual: page-action icon and pill text — judge: the 28x28 page-action icon sits in the pill's leading slot, the pill text starts after it (leading slot with text shift ruled on 2026-11-06), and the panel arrow sits under the icon — capture: captures/38-T19-page-action-pill.png — source: .planning/phases/38-webextensions/38-UAT.md
- [ ] 38 T20 Visual: sidebar view placement — judge: the sidebar page sits exactly over the right side-panel view, hides under an open Theia menu, and follows a splitter drag — capture: captures/38-T20-sidebar-view.png (placement only; the menu and splitter halves need the machine) — source: .planning/phases/38-webextensions/38-UAT.md
- [ ] 38 T21 Manual: a real install click-through — judge: from the puzzle menu's install footer, press the site's own Add to Firefox button in the stock window; the stock install prompt appears, accepting installs the extension, its button appears in the chrome bar and it works in a web tab (SC4 by hand) — capture: none (on the machine) — source: .planning/phases/38-webextensions/38-UAT.md
- [ ] 38 T22 Manual: private-browsing access (38-04) — judge: steps 1-3 passed live (session 1). Step 4 is a known defect: with a private stock window opened last, the not-allowed extension's options page opens in that private window (stock openOptionsPage uses windowTracker.topWindow). It was deferred on 2026-11-06 to backlog 999.17, WINDOWS.md entry 29. Confirm that the deferral stands; nothing new to look at unless you want to repeat step 4 — capture: none — source: .planning/phases/38-webextensions/38-UAT.md

## Portal and cross-application

These need a real desktop action in another application, which no harness can start.

- [ ] 37 T6 portal click — on the default Wayland session (no X11 route), share a screen from a page and pick it in the KDE portal chooser; the chrome bar shows the screen mark, and stopping the share clears it. 37 T6 is `pass` on the X11 harness route only (39-09); this is its human half — source: .planning/phases/37-permission-prompts-and-dialogs/37-UAT.md
- [ ] 27 T6 drag from outside the browser — the same item as 27 T6 above: drag a link from another application onto New Tab.
- [ ] 34 T7 drag from outside the browser — the same item as 34 T7 above: a URL from another application, and a file from the file manager, dropped on the strip.

## Backstop truths

Each of these is a statement only a held-out test or a person can confirm. Judge each one on the machine or from the named capture.

- [ ] E1 tooltip overflow — Gecko's stock tooltip clamps to its max width and wraps; Phase 39 does not change it (39-UI-SPEC UI Considerations; look with 35 T13)
- [ ] E1 tooltip long-text — a long `title=` wraps inside the stock tooltip; no truncation is added (39-UI-SPEC UI Considerations)
- [ ] E2 autocomplete overflow — many saved logins scroll inside the stock autocomplete panel at its stock max height (39-UI-SPEC UI Considerations)
- [ ] E2 autocomplete long-text — long usernames truncate with the stock ellipsis (39-UI-SPEC UI Considerations)
- [ ] EXT-10 adjacency — Bitwarden offers the vault login only on a page whose origin equals the saved URI's origin (scheme, host, port); a page on another port of 127.0.0.1 is offered nothing (39-14 must_haves; plant vault-uri-mismatch covers part of it)
- [ ] EXT-10 empty — with an empty vault the extension offers no fill and the page form stays unchanged (39-14 must_haves)
- [ ] EXT-10 ordering — when two vault items match the page, the fill candidates are in the extension's own order; the shell does not reorder them (39-14 must_haves)
- [ ] 37 T39 backstop 1 — no BiDi DOM assertion on `#notification-popup`: the live harness reads page-side and chrome-side outcomes only (37-VERIFICATION 37-01; a code read of scripts/verify-prompts-live.mjs)
- [ ] 37 T39 backstop 2 — notification bars are not in `BLOCKING_LAYER_SELECTOR` and never cover page content (37-VERIFICATION 37-04; the popup-block scenario asserts the rect shrink; look with 37 T32)

## Findings for a live look

Findings whose UAT row is not `[pending]`. Each needs a look, not a verdict on a row.

- [ ] 37 T6 headed sharing red (39-09) — one headed sharing run (PB_LIVE_HEADED=1 with the X11 environment, shell window on XWayland) failed at "camera and microphone were not granted through the stock Allow". The headless route, which is what the registry runs, passes. Not investigated. Check whether the stock Allow grants camera and microphone in a headed window (the portal-click item above can cover this in the same session).
- 38 T32 headed-fullscreen note: none found. 38 T32 is the page-action placement owner decision, and it is answered.
- 39-15 real-input handovers: none. Every pointer leg calibrated within 2 px, so no row went to this checklist (39-15-SUMMARY).

## Not in this pass

Phases 29, 30 and 31 are outside this live pass (ROADMAP Phase 39 names 27, 31.1, 32-38); resume with /gsd-verify-work 29, /gsd-verify-work 30, /gsd-verify-work 31.

## How to answer

For each item, answer `pass` or describe the problem you saw. "all pass" is enough if every item passes; otherwise give
the item ids (for example `32 T2`, `E2 autocomplete overflow`) with the problem. Each verdict is then recorded in its
UAT row (pass with "human check <date>" evidence, or issue with the problem), and each problem gets a backlog row and a
WINDOWS.md entry naming the repro, the cause so far and the source UAT test. The requirement rows in 39-20-DECISIONS.md
marked "re-tick after" are re-ticked once their items pass.
