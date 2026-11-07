# Milestones

## v1.5 Chrome Bar Firefox Parity (Shipped: 2026-11-07)

**Phases completed:** 14 phases, 93 plans, 91 tasks

**Key accomplishments:**
- A page-scoped chrome `<key>` row for Esc relays a `shortcut` push to the Theia frame. There the new `onPush` router and the one shortcut table send `webTabStop` back to chrome, which calls the overlay's `stop()`. The chrome bar's Reload button is the same React node showing Stop while the pushed `loading` flag is true.
- The chrome boundary file now serves the session-history read and jump, records the selected web tab per Theia frame, coalesces state pushes to one per tab per animation frame, and hard-reloads with Firefox's kSkipCacheFlags. The frontend has `history()`, `gotoIndex()`, `reload(bypassCache)`, `openInBackground` and a selection contribution. The bridge gate now derives push kinds, action kinds and kind classes, and goes red when any of them drift.
- Back and Forward now open the tab's session history as a stock Theia `.lm-Menu` (right-click, the context-menu key, Shift+F10, or a 500 ms hold), with copy that names the configured application name. Reload ignores clicks for 650 ms after Stop, Shift+click hard-reloads, middle-click and Ctrl+click open a background tab, and an http(s) link dropped on New Tab opens in a focused tab. Every gesture is proven live.
- Two settings, `browser.showHomeButton` (off by default) and `browser.homePage` (empty by default), control an optional Home button after Reload. The button appears and disappears live. A click opens the home page through the pill's own address routing. An empty value opens the empty page and focuses the pill. A rejected value shows one Home-failure row whose Enter or click opens Settings filtered to `browser.homePage`. All four branches pass live.
- Chrome serves find, zoom and mute arms with primitive state pushes and two static gates; live find, zoom and the mute round trip pass, while the audio playback push and the print-today and edit-today probes are not proven.
- Chrome bar gains a find strip, a zoom chip and a tab audio mark, and Ctrl+F, F3, Ctrl+=, Ctrl+0 and Ctrl+M from a focused page reach the same widget methods through the page relay; find, zoom, audio and downloads pass live on the rebuilt shell.
- Chrome serves the system-dialog print branch behind a webTabPrint arm, the print-today probe is recorded as completing, and a Ctrl+P relay row now calls print(); the on-screen dialog and its cancel are deferred to the end-of-milestone pass.
- Chrome serves one Downloads view and pushes serialized rows; the live downloads scenario proves a page-started download becomes a row that Cancel stops and Retry finishes, while Open, Show in folder and the panel's on-screen behaviour are not yet verified.
- Ctrl+S on a focused web page opens the Theia "Save page as" dialog, and chrome writes the page through the savePageCopy minted directory to the picked path; the Theia frame keeps Ctrl+S, and the copy is proven live on the dev tree and on the packaged binary.
- Edit commands reach the focused page through a frozen webTabEdit kind for the probe's chrome-help set (undo, redo, cut, copy, paste, select-all, delete); key-driven editing sends no bridge traffic; greying on a collapsed selection is not delivered.
- The reader, view-source and crash chrome arms, the crash listener and the favicon push are built and gated; the shared-process blank reload was not reproduced on the unfixed tree (verdict not-reproduced R 0/4 A 0/4), so the remoteness fix does not start, and the DevTools route and the readability signal are not delivered.
- Extensions now mute the overlay, see its mute and zoom state through tabs.get, tabs.getZoom and tabs.onZoomChange, and Theia receives the same state; patch 050 is regenerated, stamped and rebuilt, and the full 20-scenario live suite passes on that binary.
- Chrome now serves bookmark insert/update/remove, the closed-tab list and reopen lookup, and a single `clearHistory` fan-out (Places `removeVisitsByFilter`, closed tab rows, thumbnails, saved pages, web-tab histories; token cookie never reached). A Places observer pushes `bookmarks-changed` to the Theia frame. Rule 12 classifies every new kind, and the new `verify-clear-history` gate pins the fan-out against the boundary's own store declarations.
- The pill ends in a 24px star (outline muted, or filled in text ink when bookmarked). It follows the `readBookmarkByUrl` point-read and the `bookmarks-changed` push. A click, or Ctrl+D on either focus path, bookmarks the page through `bookmarkPage` and opens a 320px `.pb-chrome-bar-dropdown` editor with Name, three root-folder radios, Remove (runs at once), Cancel and Done. All writes run from `address-bar.tsx` handlers. The new `bookmark-page` command only opens the star path.
- A 28px bookmarks toolbar row under the pill, in every mode, behind `browser.showBookmarksToolbar`. It re-reads `listBookmarkFolder('toolbar')` on every `bookmarks-changed` push and puts overflow behind a pinned chevron. Ctrl+Shift+T reopens the newest closed tabs.sqlite row on its own key, arming its saved back/forward history first. The hamburger's reserved History row is now a submenu: Reopen Closed Tab, Recently closed tabs, Recent pages. Ctrl+Shift+T and Ctrl+Shift+B work on both focus paths.
- A 320px Clear Recent History panel opens 4px under the hamburger, from the History submenu row, Ctrl+Shift+Del (pill or page focused) or the `Clear Recent History…` command. It offers five ranges with Last hour checked, the fan-out footnote, and Cancel and Clear (danger ink). Clear or Enter sends `clearHistory(range)` from the widget's confirm handler, the only caller. No command, key or relay row clears. A live scenario plants markers in every store and checks, for each range, that in-range rows go, out-of-range and open rows stay, and the token cookie stays.
- The hamburger now has every MENU-03 entry in Firefox order around the unmoved Phase 31 rows, plus an Edit row (PAGE-09). There are five submenus: Bookmarks, Zoom, Edit, More Tools and Help (History came from 33-03). Every action row runs the Browser command id its Actions row runs. Full Screen toggles the shell window through a new `window-chrome` store kind behind a stable id that Phase 35 inherits. The Edit rows grey from the page's live enablement, read through a new child-side actor query.
- Right-clicking a strip tab opens a per-request stock menu with the full ROADMAP item set, each row enabled from a predicate read at open time and acting only on the right-clicked tab; Bookmark Tab and Bookmark All Tabs call the Phase 33 bookmarkPage path through one call site in chrome-bar-widget.tsx; a new static gate compares the menu to ROADMAP criterion 1 at check time with six plants.
- Strip tabs reorder by a midpoint-rule drag that moves the title in the home pane TabBar (insertTab), with a 2px drop indicator and 8px edge auto-scroll; middle-click closes a tab and is consumed so Gecko never pastes; a double-click on the empty strip opens a new tab with the pill focused; dropped http(s) links open in the background at the drop position, text searches through the pill, and javascript:, other schemes and files are refused with a sentence; an overflowing row gets a List All Tabs chevron whose menu activates a tab and scrolls it into view. No new kind is added.
- Pinned tabs are strip-local state keyed only by GroupModel.keyOf, render as a 32px icon-only sticky block at the strip's start, stay out of the range closes, and persist as [{ key, url }] in the shell-state map; after the launch restore they re-pin by own-key equality, with missing web tabs reopened on their stored rowKey. Ctrl/Cmd-click, Shift-click and Esc drive a keyOf-keyed selection, and the Close/Move/Mute/Bookmark N Tabs rows run each selected tab's own single-tab row. No kind, no catalogue row and no tabs.sqlite change were added.
- Hovering a background tab for 400 ms opens a 280px aria-hidden card fixed 4px below the tab. The card shows the settled GUI-08 thumbnail from GroupModel's cards, or a text card with title and URL. It is listed in BLOCKING_LAYER_SELECTOR, so the page hides while it is open. A background tab whose settled page changes its title shows a 6px accent dot, the "— Updated" tooltip and the ", updated" accessible name. The flag behind the dot is one primitive field on the existing webTabPush state literal, minted chrome-side and cleared through the webTabActivated arm's push. The frame never writes it. No kind, no store kind and no catalogue row were added.
- The gBrowser stand-in gate now derives its actor scope from both actor registries (84 parent entries, 78 URIs, 36 modules outside the two actor directories, 83 actor files), records verified reasons for the four members that adds, implements shouldActivateDocShell through the tab host, and compares every Phase 27 shim global the boundary file defines against what upstream calls on it.
- Remote page tooltips and link-hover status now reach the shell through an AppWindow-registered `window.XULBrowserWindow`. Tooltips use the stock `remoteBrowserTooltip`; link status is an `overLink` push to a truncated in-bar `.pb-page-status` line. Both serve overlays only. The furniture gate and the live harness that later Phase 35 plans extend now exist.
- A right-click in a web page now reaches Theia as a stock `.lm-Menu`. The `nsContextMenu` shim captures ContextMenuParent's data and the stub `#contentAreaContextMenu` is always cancelled. The rows use Firefox's ids, order and strings, and picks come back as the privileged `webTabContextMenuAction`. Open-in-new-tab rows carry the page's principal and referrer through a 5-second single-use grant, and a non-http(s) link shows the refusal row.
- The page menu's remaining PROMPT-04 rows now call mechanisms that already exist.
- Extension context-menu entries now reach the page menu, and the page shows a still under the menu when the capture makes 50 ms.
- The shell now hosts upstream's PopupAutoComplete panel, the form-validation template and a textActions.ftl localization, and every overlay names the autocomplete panel. The furniture gate derives all of it from upstream.
- A page's element fullscreen now completes in the shell with Firefox's own fullscreen warning, through FullScreen and PointerlockFsWarning stand-ins ported from upstream. F11 on a page runs Phase 33's full-screen command, and the IDE keeps F11.
- The shell window now carries a full nsIBrowserDOMWindow receiver and an openLinkIn companion behind the boundary. A page in a web tab that opens a new window gets a pending overlay chrome-first. The frontend mints the widget next to the opener and acks. A 5 s fallback opens the page in the stock window. Theia and print openers fall through to Gecko's own window. A new derive-and-compare gate holds all of this in --quick.
- The frontend adopt half from 36-01 is verified, and its push subscription now catches async failures. The stock-window command now reaches stock chrome only through the openStockTab actor kind, with no popup branch. The bridge gate allows that one sender and goes red on a second sender or a popup in the dead-channel branch.
- The live check for PROMPT-05 is written and registered: seven scenarios on the Phase 27 probe harness and eight in-session plants, with two rows after the GUI-01 rows. None of it has run. This tree has no objdir, and the live runs are deferred by owner ruling to the end-of-milestone pass.
- The stock PopupNotifications now runs on the shell window with the #notification-popup panel. Its tabbrowser facade sits over the tab host and is audited member by member. Prompts are answered only through the stock panel buttons. The tab strip shows a display-only pending mark. Background requests queue (cap 3 per tab, that tab's oldest cancelled through the stock removal). A static gate and a live harness cover all of this. The live run is deferred because this lane has no built binary.
- Upstream's webRTC-shareDevices doorhanger is now installed verbatim in the shell, with its webrtc-preview callback, so a camera or microphone request has the template WebRTCParent looks up. Remember stays the stock checkbox, and a derived gate rule makes the stock PermissionUI write the only prompt-path writer. The chrome bar shows one mark per shared kind. The marks come from webrtcUI's own state, which WebRTCParent reports through `gBrowser.updateBrowserSharing`. The live scenarios are written and their offline audit passes. The live run is deferred because this lane has no built binary.
- Probe 1 is written as the `dialog-probe` live scenario, and the verdict file holds the owner default `stock-keeps-ide-usable`, marked provisional with no evidence. Rule (p) in the permission gate pins the tree to the verdict. Under the stock verdict, `powerbrowser.js` must have no `getTabDialogBox` member. A provisional verdict is accepted and named in the gate's output. The `dialog`, `stop-repeat` and `beforeunload-scope` scenarios are written with their plants. All live runs are deferred because this lane has no built binary. Static evidence suggests the live probe may flip the default, as described under Risk.
- Password save and update now use upstream's own password-notification template and PopupAutoComplete panel. The stock LoginManagerPrompter fills those fields and reads them back, and no credential crosses to Theia or reaches a log. Blocked popups, hung scripts and protocol registrations each produce a per-tab bar. The bar renders inside the web tab widget, and the page rect starts below it. The bars are answered through webTabBarAction, a single kind with a fixed enum, and no answer writes a permission. The blocked-popup Allow opens the stored popup through one Phase 36 openAdoptedWebTab call site. The five live scenarios are written and pass their offline audit. The live run is deferred because this lane has no built binary.
- Chrome now reads every running extension's browser action for the 31.1 host's selected tab and pushes the whole set to Theia. A click runs `triggerClickOrPopup(selectedTab)` and nothing else. An extension's `tabs.create`, `tabs.remove` and selection writes mint, close or select an overlay that the frontend claims through the Phase 36 adoption shape. Every static gate is green; both live scenarios are written and deferred.
- Pinned extension actions now render as chrome-bar buttons, with icon, badge, enabled state and pressed state taken only from the extensionAction push. Every extension is listed in a puzzle menu, each with a gear menu holding Pin to Toolbar, Manage Extension and Remove Extension. A click sends extensionClick with the button's anchorRect. Chrome runs the one click path and opens any popup in a native XUL panel at that rect. The panel closes on Esc, an outside click, focus moving into a page, a tab switch or a second click, and focus then returns to the pill. All static gates are green. The three live scenarios are written and deferred.
- Page actions now have a pill icon. Chrome pushes a page-action row only while `isShownForTab` is true on the 31.1 host's selected tab, and the address pill's leading slot draws exactly those rows. A click runs the page action through the toolbar buttons' path: `run(row, anchor)`, then `extensionClick`, then the one `triggerClickOrPopup(selectedTab)`, then the native panel. Patch 050's page-action skip now signals a re-push on `show()`, `hide()` and navigation. Two relaunch live scenarios are written: `content` covers content scripts, `sender.tab`, `tabs.sendMessage`, webRequest tab ids, `show_matches` and the zero-overlay startup, and `page-action` covers the pill icon. The static gate shows that extension menu entries reach the menu only through the Phase 35 relay. All static gates pass. Every live run is deferred.
- Three add-ons site hosts are allowlisted and documented in the same commit, and a derived gate keeps them tied to upstream's install and update prefs. The puzzle menu's install footer is now the real install trigger: a `network` store kind that opens the add-ons site in the stock browser window, whose stock install prompt is the only install UI. The new live file proves the prompt path (`amo-install`) and the three D-07 extensions' page-side effects in web tabs (`fixtures`). Every static gate and self-test is green. The live runs are written and deferred, and the password-manager fill needs an owner decision.
- Patch 050 now resolves `ExtensionParent.browserPaintedPromise` on `extensions-late-startup` and runs the enterprise policies' `onAllWindowsRestored` callbacks on that topic. As a result, event pages wake and shipped policies apply in a shell-only session. The change shipped with no Gecko compile, is covered by guard rows G14 to G16, and is proven red-then-green by two live scenarios with live plants.
- C22 was a product throw: the drag-session check in showTooltip throws in a headless shell, which has no drag service. C24 was an instrument defect: Copy Image does write an image flavour, observed headless through the clipboard cache and headed on the Wayland clipboard as image/png.
- C23 was the instrument: WebDriver BiDi's recommended prefs set `signon.rememberSignons=false`, so the login manager never processed the form. saved-login now turns it back on and passes. Three new scenarios prove 35-REVIEW CR-01, CR-02 and WR-03 live with plants. save-as-late found that the "menu had already closed" message could never be shown, and that is fixed in the product.
- WR-04 (status line cleared on a keyboard tab switch and on navigation) and WR-06 (no Inspect under the DevTools policy; a refused row says so) are now proven live, each with a plant. Both page-furniture registry rows pass at 0c6b3a85: 25 of 25 scenarios and 34 plants. The menu-spelling flake from 39-05 was the instrument and is fixed. Rows 12-15 now carry headed captures for Chris.
- Probe captures are now PowerBrowser-window-only PNGs, size-checked against KWin's frame geometry at the output scale. The four prompts plants reach their own failures. Screen sharing passes live with no KDE portal chooser through an X11 capture route that the harness sets for the sharing session only.
- prompts-live now skips dialog and dialog-probe only while REQUIREMENTS.md records the PROMPT-03 deferral, and two static plants prove the skip stops when the record changes. Probe 1 was re-run live and headed, and its verdict is unchanged. Four new scenarios prove CR-01a, CR-01b, CR-01c and CR-02 live, and each has a plant that goes red.
- 999.11 is fixed: the opener-null plant now goes red on its own failure, and the self-test refuses overlapping plant expects. Five new adopt scenarios cover 36 T12-T16 live, with 14 plants red through the registry. 36-UAT rows 12-16 pass, and the T17 capture is committed for Chris.
- All four fixes are on main, each with live evidence. Only 38 T22 step 4 is still red, which is deferred item 3 (a patch 050 owner call).
- Seven new scenarios, each with a plant, cover 38 T22 and T25-T30.
- Requirements and roadmap now match the evidence by one stated rule (41 ticked), the 41 human-only checks are listed in one file, and Chris deferred them all on 2026-11-07, so 12 requirements stay unticked until the checklist is worked and PAGE-05 until backlog 999.19.

**Closeout type:** override_closeout (Chris, 2026-11-07, via AskUserQuestion: "Defer: record all as pending, continue").

**Verification state at close:** phase 28 passed; phases 27, 29-38, 31.1 read stale/human_needed; phase 39 human_needed. Final `--gate` at 77e5d037: 456 PASS, 32 FAIL, all 32 excluded under open WINDOWS.md entries 25, 28-43 (each with a backlog row 999.17-999.33). Audit: `.planning/milestones/v1.5-MILESTONE-AUDIT.md` (status tech_debt; 41/87 requirements satisfied, 46 partial, 0 unsatisfied, 0 orphaned; integration verified 9/9 flows).

### Known Gaps
- 46 v1.5 requirement rows unticked, each waiting on a human or owner item: SMODE-07, NAV-03..06, SITE-01..08, MENU-01..04, PAGE-01/04/05/06/07/10/11, BMK-01/02/04/05/06, TAB-05/06/08, EXT-06..10, PROMPT-01..09. 12 re-tick when the checklist passes (`39-20-DECISIONS.md`); PAGE-05 waits on backlog 999.19; PROMPT-03 is deferred to 999.3 (ledger 26).
- `.planning/milestones/v1.5-phases/39-v1-5-close-out/39-HUMAN-CHECKLIST.md`: 41 human-only items (28 pending UAT rows in phases 27, 32-38; 3 portal and cross-application steps; 9 backstop truths; 1 headed sharing finding). Resume with `/gsd-verify-work <phase>`.
- Phases 29, 30 and 31 are outside the Phase 39 live pass: `/gsd-verify-work 29`, `30`, `31`.
- 8 defects found by the full registry run carried to v1.6 (ledger 34, 36-41; backlog 999.30/999.31).
- Known verification overrides: 13 phases newly recorded (stale/human_needed), 0 carried forward.

Deviations from the standard close workflow (same as v1.4):
- `.planning/REQUIREMENTS.md` was NOT removed via `git rm`: the `allowlist-doc-consistency` --quick gate reads it; the v1.5 content is archived verbatim and `/gsd-new-milestone` overwrites the live file.
- Phase directories are archived by the cleanup step after its dry run (`milestone complete --no-archive-phases`), not by `milestone complete` itself, so the deploy workstream's phase numbering is untouched.
- Quick tasks under `.planning/quick/` were not archived (opt-in, left for the owner).

---

## v1.4 Platform Updates and GUI Close-out (Shipped: 2026-10-19)

**Phases completed:** 8 phases, 43 plans, 44 tasks

**Key accomplishments:**
- One commit (B, `02fffb6210fda013fe22c0794c3bad92b1daa2c5`) removes the `[ai]` manifest table, the `ai.backend` schema key, `emitAiBackend` with its TARGETS row (generator now 53 targets), `powerbrowserAiBackend`, the REBRANDING `[ai]` section, the three verify-opencode scripts, the NG-051 check, the adapter doc, and every registry row and helper that named them.
- The 153.1 full-run FAIL baseline (218 rows, 188 PASS, 30 FAIL, every red row owned) is committed before the substrate moves. The fetch-upstream `_RELEASE`/`_BUILD<n>` comment and `configuration.toml:104` are corrected without a gate changing state.
- Gecko is pinned to `FIREFOX_153_5_0esr_BUILD1` (`223014c6b9299ac9b035b4c50ea481e5c6de282c`). The four patches replayed byte-unchanged. A clobbered dev build reports `DeBIOS powerbrowser 153.5.0esr`, a 153.5.0 package exists, and smoke-firefox now compares against `version_display.txt` instead of a literal.
- The release objdir is rebuilt at 153.5.0esr with release branding (2620 s). The full 153.5 run has 218 rows, 206 PASS and 12 FAIL. Every FAIL label is in the 153.1 set B, and all 17 version-sensitive rows PASS. Seven of the 12 reds are unmeasured because port 3000 is still held.
- GroupModel loads itself at layout init. The Browsing strip paints only the active group's tabs, the loose tabs and the current tab. "+" writes the new tab into the active group. pan03 proves all of this live, on a rebuilt sidecar, with two probe controls shown able to go red.
- The copy check now reads every single-quoted and template literal at every text sink, including the ARIA text attributes. The empty-canvas body ships in Chris's C1 item 4a wording. The grip value, card tooltip and zoom readout (21-REVIEW WR-05) are contracted in 15-UI-SPEC.
- A closed group is hidden for UNDO_CLOSE_MS (15000 ms) on GroupModel, writing nothing. Undo restores it exactly. The close is written through the unchanged closeGroupRows when the timer ends or when PowerBrowser quits, and never by a mode switch. During the window its tabs show in no tab bar in any mode. pan04 proves this live with three probe controls.
- × closes a group at once, with no dialog. An Undo Close Group control appears in the group's bounds on the canvas, or in its section's place in the tree, and takes focus. Undo restores the group. When the window ends, the close commits. The 15-UI-SPEC and the three gui08 checks changed in the same commit as the code (SC3), and each passed there. ng-006 now proves the tabs close when the window ends.
- The last visible group has no x on the canvas or in the tree, and the close-group command does nothing for it: no undo window, no Undo control, no status-bar notice. A pending group does not count as remaining. GroupModel.canCloseGroup implements the rule, and the guard is the first statement of `closeGroup`. close-exactness derives the guard in the model, the canvas and the tree, and pan04 shows it live.
- Each card that takes the pointer has a 24 × 24 round × at its top right, labelled "Close tab", and Delete on a focused card does the same. An open tab closes through Theia's own close, so a dirty editor shows the stock save prompt and Cancel keeps it. A card whose tab is not open marks its row closed. A group emptied this way stays. pan05 shows all of this live, with both probe controls turning red.

**Closeout:** override closeout, chosen by Chris on 2026-10-19 after the audit (status gaps_found). CI run 39340825244 is green on the pushed 0efb116, and NG-074 is done.

### Known Gaps

- **UAT-01**: Chris ran A01–A20 live. The rest of the live UAT is deferred by Chris (NG-089 deferred-approved to phase 26: "I want to do the GUI checks when everthing is done on my own time"). His list is `milestones/v1.4-phases/24-live-uat-pass/24-CHRIS-CHECKLIST.md`.
- **MODE-01 (live half)**: A18 failed. Organising opens inside one pane of a split main area, and G-11 is not earned.
- **PAN-03..06 (live)**: Phase 22 is verified statically (14/14). Its live checks are among the deferred UAT rows.
- **12 defects for v1.5**: listed in `milestones/v1.4-phases/24-live-uat-pass/24-GAPS.md`. They are A18, chrome-side errors, A21, B01, A25, A27, A31/A42, A40, A44, A45/B03, B02 and B07.
- Known verification overrides: Phase 22 (human_needed), Phase 24 (no VERIFICATION.md; 24-05 not run), Phase 25 (no phase directory; CI run is the evidence).

---

## v1.3 Browser GUI (Shipped: 2026-09-06)

**Phases completed:** 3 phases, 10 plans (13: 3, 14: 3, 15: 3 + 1 revision), ~30 tasks

**Key accomplishments:**

- Chrome bar as a toolbar-like `@powerbrowser/*` contribution (back/forward/reload, pill address with 8-row suggestions, New Tab via stock-window escape, mode toggle) with derive-and-compare gates, all green.
- Strip-relocation spike verdict RED (mechanics proven live; zero-core pillar unprovable on pre-existing core-diff drift) → Variant-A fallback recorded: strip stays top, modes still ship, re-probe runway documented.
- Modes as data (coding/browsing/organising defaults + user-saved customs in user-storage JSON, no manifest flag); sliding panels; tabs invariant asserted by gate; dependent windows via stock secondary-window route (probe GREEN); named setups with restore applicator; core-close-full-kill.
- Panorama organising canvas (free drag, corner resize, auto-box on canvas drop, zoom, ungrouped tray) + tree over identical group data; SQL groups table + `group_id` via single chrome-side writer (JSWindowActor pair, origin-scoped); PNG snapshots with guaranteed text fallback; placeholder retired.
- Reviews: 10/10 (13), 13/13 + 3 UI (14), 19 + 3 UI (15) dispositioned; security SECURED ×2; UI audits 15/24 and 20/24; `--quick` green throughout; single driver, no core fork, no new packages.

**Carried as tech debt:** verifications 13/14/15 deferred per standing nonstop rule; GUI-07/GUI-08 box flips; 14 minor UI batch; piles + type-anywhere search OUT; IN-07 same-origin forgery inherent.

---

## v1.2 Sign-off Closeout and SQL Store (Shipped: 2026-09-05)

**Phases completed:** 3 phases, 9 plans, 22 tasks

- **Git:** 80 commits v1.1..v1.2 · 65 files, +11,457/−219 · 2026-09-05 → 2026-09-05 · tag `v1.2`
- **Archives:** `.planning/milestones/v1.2-ROADMAP.md`, `.planning/milestones/v1.2-REQUIREMENTS.md`, `.planning/milestones/v1.2-MILESTONE-AUDIT.md`, `.planning/milestones/v1.2-phases/` (10, 11, 12)
- **Closeout type:** override_closeout. Audit status `tech_debt` (accepted per standing nonstop instruction — proceed). 20/20 requirements implemented with evidence; 17/20 boxes checked. All 3 code reviews clean (Phase 12's 4 blockers fixed with live binary proof). Verifications 10/11/12 deferred (resume `/gsd-verify-work 10|11|12`).
- **Known verification overrides:** 1 newly acknowledged at close (uat_gaps 10/10-UAT.md, 5 pending-human scenarios), 14 carried forward from prior closes (see STATE.md Deferred Items); 13 archived v1.0 deferred items disclosed in the v1.0 archive — acknowledge-call cannot match archived text (tooling, same as v1.1), carried without re-suppression.

**Key accomplishments:**

- Six record-close boxes with cited evidence plus the 16-vs-15 reconciliation plus five staged UAT sheets, --quick green
- Probe-first live drills green on the current tree where runnable, staged-with-unblock where environment-bound; one inert packaged-data delta synced byte-faithfully, no rebuild
- Final tree gates-green on every cited row plus full-tier drill re-runs, registry alone with twinned checks, all 15 requirements dispositioned, human remainder routed as five staged sheets — VERIFIED
- SQL store authority rules signed before schema work: six invariants with Phase 12 enforcement pointers plus a recorded approval
- Readonly better-sqlite3 query API beside the frozen registry, chrome-side Places reads plus sessionstore projection, and an emitter-exercising absence instrument whose startup wiring has landed (NG-020 done on main, merge 5f990e6)
- Second-writer scan and integrity soak as proven instruments, nine SQL-05 registry rows with honest tiers, and the ESR rebase drill evidenced at the live newer tag

Known gaps / tech debt carried (non-blocking, see audit):
Phase 10 — five human UAT signatures staged (10-UAT.md runbooks); Phase 11 — missing 11-02/11-03 summaries, SQL-03 box unchecked despite landed evidence; Phase 12 — missing 12-01 summary, SQL-01/SQL-04 boxes unchecked despite landed evidence; ROADMAP plan checkboxes (11-02/11-03, 12-01) vs Progress-table 3/3 mismatch (same doc-sync class).

Deviations from the standard close workflow:

- `.planning/REQUIREMENTS.md` was NOT removed via `git rm` (same v1.0 idiom): deleting it
  turns `allowlist-doc-consistency` (a `--quick` gate requiring the three
  inherited Mozilla egress hosts in both ROADMAP.md and REQUIREMENTS.md)
  red with no replacement until `/gsd-new-milestone` writes the next file.
  The v1.2 content is preserved verbatim in the archive above; new-milestone
  overwrites the live file. Tree stays green at the tag.

---

## v1.1 Hardening and SQL Tabs (Shipped: 2026-09-05)

**Phases completed:** 2 phases, 9 plans, 25 tasks

**Key accomplishments:**

- WR-04 bare-dollar NSIS rejection plus WR-07 fixture-rooted tile check, with identity.display_name carried to PowerBrowser through the emitter, comparands, and re-pinned gates -- byte-identity and full --quick green.
- Display gates re-pinned to PowerBrowser, canonical-form Ironwood fixture proving no-space emission byte-exact, full --quick green with identity pins frozen -- build-anchored rows staged for tier-3 with dated evidence.
- registerWindowActor boundary guard with a file-and-pattern plant plus URL-matched BiDi context selection with live two-context proof -- ledger 13 and 14 closed, single-touchpoint invariant holds.
- Updater compiled in, one real Linux N→N+1 MAR hop from the fork descriptor with zero Mozilla hosts, Nix-built NSIS setup.exe, and the packaging procedure with attributed timings — PKG-01/02/03 proven on Linux.
- Named packaging hosts with staged win/mac unblocks, a live-green Linux install matrix with alongside proof, a fresh 54-minute release build closing ledger 10, a green live rebase drill to 153.2.0esr with restore, and a NAME-01 re-scope of the live branding gate -- full --gate green.
- Synthetic npm plus local-path entries generate pinned theiaPlugins lines, floated and absent inputs fail loud naming the entry, and the downloader placeholder passes through verbatim — zero network, commit gate green.
- Minimal Antenna-protocol crash collector (stdlib-only, loopback-bound) with a discriminating contract gate, a written PII/retention/throttle policy, and ping/report separation cases — loopback round-trip proven.
- Manifest `[[webextensions]]` table emitted as `ExtensionSettings` into the tracked `policies.json` with a discriminating agreement gate, ESR unsigned-install mechanism confirmed in-tree — zero bundled add-ons, commit gate green.
- Five-entry staged manifest proves every extension source kind on real nix-linux artifacts (stock vsix download with placeholder expansion, per-target hashes, pin re-proof green, sidecar build 0 errors), win/mac cells honestly staged, and the Theia re-pin agreement holds at 1.74.1 with the token gate intact — tracked tree restored byte-identical.

---

## v1.0 PowerBrowser — SHIPPED 2026-09-04 (override closeout)

- **Phases:** 7 (1–7) | **Plans:** 52/52 executed | **Tasks:** ~140 (from phase summaries)
- **Git:** 326 commits (68 `feat(`), 352 files, +93,852/−34 · 2026-08-22 → 2026-09-04 · tag `v1.0`
- **Archives:** `.planning/milestones/v1.0-ROADMAP.md`, `.planning/milestones/v1.0-REQUIREMENTS.md`
- **Closeout type:** override_closeout. No milestone audit file; all phase verifications `human_needed` (static checks green, human/tier-3 drills staged); 16/31 requirements unchecked (deferred verification batch, not missing code).
- **Known verification overrides:** launch-lifecycle batch (WINDOWS #11 + #19, 19/19 green on dev binary, run 2026-09-04 by executor); trademark ritual signed (Chris, 2026-09-04, CONFIRMED).

Shipped: a booting, browsable PowerBrowser tree rebrandable through
`configuration.toml` + `brand/` alone — byte-identical generator core,
Gecko + Theia branding emitters, hook-only patches, two-layer verification
in CI, and Sourcerer reproduced as a pure downstream.

Known gaps (carried to v2, see `.planning/NEXT-MILESTONE-INPUTS.md` §3):
human-eyes drills (03 icon pixel look, 04 welcome/about render drill);
heavy-machine drills (release build + release-variant rows, per-fixture
tier-3 builds, live ESR rebase, Theia re-pin proof); WINDOWS #13
(registerWindowActor boundary hole), #14 (BiDi double-window).

Deviations from the standard close workflow:

- `.planning/REQUIREMENTS.md` was NOT removed via `git rm`: deleting it
  turns `allowlist-doc-consistency` (a `--quick` gate requiring the three
  inherited Mozilla egress hosts in both ROADMAP.md and REQUIREMENTS.md)
  red with no replacement until `/gsd-new-milestone` writes the v2 file.
  The v1 content is preserved verbatim in the archive above; new-milestone
  overwrites the live file. Tree stays green at the tag.
- Phase directories were left in place (equivalent to
  `--no-archive-phases`): the v1.0-ROADMAP archive carries the phase
  record, and the raw execution history remains browsable.
