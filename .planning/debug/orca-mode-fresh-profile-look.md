---
status: awaiting_human_verify
trigger: "Owner, 2026-11-18, with a screenshot of the dev build on a fresh profile: 'Bit GUI problem. orca dose not look like orca'"
created: 2026-11-18T00:00:00Z
updated: 2026-11-19T04:10:00Z
---

## Current Focus

status_note: round 2 fixed and verified live headless. A: 94e23217 (Theia's status bar has its own mode rule; the
  Orca mode hides it). B: fa82a7f7 (Orca's right-sidebar flag and the Theia right panel are one state in the Orca mode;
  Orca's RightSidebarToggle at the main area's top right while the panel is collapsed; clauses k and l). The Theia
  bundle and the Orca pane bundle (with the browser host and the standalone variant) are rebuilt. Awaiting the owner's
  look on his machine. Open owner calls, not acted on: Orca's own status bar at the bottom (feasible, see the Evidence
  entry 'Orca status bar'), and Welcome vs Orca's Landing in the main area.
next_action: owner relaunches the dev build and judges A and B against the real Orca app; on "looks right" ->
  archive; on a status-bar or Landing request -> new investigation/plan (a feature, not a defect fix).
hypothesis_A: |
  Theia's status bar shows in Orca mode because ModeRules has no status-bar rule: activateMode hides it with
  !rules.furniture, and the orca row needs furniture: true for its side containers (TopTabsSidePanelHandler: the
  containers are the side panels). Test: red clause k on the current build; a statusBar rule false for orca turns it
  green while Coding still shows the bar.
hypothesis_B: |
  Orca's right-sidebar toggle does nothing a user can see in PB because the flag it flips (rightSidebarOpen in Orca's
  store) is not connected to the Theia right panel that hosts RightSidebar, and the control Orca shows in the closed
  state (RightSidebarToggle in its own titlebar/workspace shell) is not hosted. Test: red clause l (click Orca's
  toggle: the panel must collapse; a visible Orca toggle must bring it back with content).
bug_class: Bohrbug (deterministic layout; same on every launch with the state described)
hypothesis: |
  H1 (symptoms 1 and 3): PB's pane root (pb-pane-mount.tsx mountPane) is a COLUMN flexbox, while Orca mounts
  Sidebar and RightSidebar as children of a ROW flexbox (AppWorkspaceShell.tsx) and sizes their width itself from
  the store (useSidebarResize writes style.width = sidebarWidth / rightSidebarWidth px, flex-shrink-0). In a column
  parent the surface takes its content height and Orca's own px width, so it does not fill the Theia part; the rest
  of the part shows the pane root's background (Orca's body background mapped to [data-pb-orca-pane]).
  H2 (symptom 2 layout): the Welcome page spread is Theia's own @theia/getting-started rule
  .gs-container { display:flex; flex-direction:column; justify-content:space-between; height:100% } applied to
  PB's welcome widget, which reuses the class with four direct children; not Orca CSS.
  H3 (symptom 2 content): Welcome in the main area is the recorded design (P64-18 shared main area; 64-CONTEXT:
  Route A shows no Orca landing page; P65-10 'terminal' view does nothing) -> owner judgement.
test: done (probe + clause j red on the unfixed build, green after 46c4d70d; welcome clause red, green after 91956f91)
expecting: n/a
reasoning_checkpoint_round2:
  hypothesis: "A: the status bar has no rule of its own (activateMode hides it with !rules.furniture, and the orca row
    needs furniture: true for its side containers). B: Orca's rightSidebarOpen flag, which Orca's close button flips,
    is not connected to the Theia right panel hosting RightSidebar, and Orca's closed-state RightSidebarToggle is not
    hosted anywhere."
  confirming_evidence:
    - "k red: bar 22 px, hidden flag false, side areas 22 px short of the shell bottom in both Orca passes"
    - "l red: Orca's close left the panel expanded; no toggle while collapsed; Theia's reopen came back without
      Orca's content (flag off)"
    - "source: mode-service.ts:391 statusBarWidget.setHidden(!rules.furniture); RightSidebar renders closeButton and
      panel content only while rightSidebarOpen; RightSidebarToggle lives in TitlebarMainStrip/AppWorkspaceShell,
      neither mounted by the overlay"
  falsification_test: "after the fix k or l still red; or Coding loses its status bar (k's control red); or a
    container leaks (g red); or the toggle shows outside the Orca mode"
  fix_rationale: "A: give the status bar its own data rule (statusBar) so Orca keeps its side containers without
    Theia's bar; B: carry Orca's own flag both ways between Orca's store (its own setRightSidebarOpen action) and the
    Theia right panel, and mount Orca's own RightSidebarToggle where AppWorkspaceShell puts it (top right of the
    workspace area = Theia's main area) while the panel is collapsed"
  blind_spots: "headless light theme only; real pointer input not used (element.click as other clauses do); the
    launch race with Orca's hydration (closed in the fix: the flag is reported only after persistedUIReady and its
    first value is the starting state, so the Orca mode's open panel wins at launch, as on every Orca activation)"
  candidate_causes:
    - "code (modes): status bar coupled to furniture (confirmed)"
    - "code (overlay/orca-panes): flag not bridged, closed-state control not hosted (confirmed)"
    - "config: workbench.statusBar.visible preference (ruled out: StatusBarImpl only re-shows on that preference's
      change; the bar shows because activateMode setHidden(false))"
    - "environment: headless vs owner's machine (ruled out: the owner's screenshot shows the same bar)"
  and_gate: "B yes: two conditions (no flag bridge AND no hosted closed-state control); bridging alone leaves no Orca
    control after a close (PB's layout control remains, but not Orca's), hosting alone leaves the panel stuck open."
reasoning_checkpoint:
  hypothesis: "Symptoms 1 and 3 are one layout defect: OrcaSideViewWidget's node carries data-pb-orca-pane, so
    pb-css-scope maps Orca's body rule (height: 100dvh) onto it and the part node is a viewport tall; inside it,
    mountPane's column-flex pane root holds Orca's Sidebar/RightSidebar, which size their own width inline from the
    store (280/350 px) and take content height because Orca designed them for a row-flex column."
  confirming_evidence:
    - "probe: sidebar surface 280x320 inline width 280px in a 244x591 body; right-sidebar surface 350x52.5 inline 350px"
    - "probe: part node 768 px = innerHeight while the body is 591 px; Orca main.css body { height: 100dvh }"
    - "clause j red on the unfixed build naming exactly these edges"
  falsification_test: "after the CSS fix, clause j still red (surface or node edges differ from the body) at 244 px
    and at 460 px; or the footer row of Orca's sidebar not visible in a screenshot"
  fix_rationale: "the part body is the column Orca's shell would give the surface; making the node fill the body and
    the surface fill the node restores Orca's own geometry, instead of patching per symptom"
  blind_spots: "Orca's own resize handles stay in the DOM and would write Orca's stored widths with no visible
    effect; the kanban drawer (offset by sidebarWidth) was not opened; only light theme headless was measured"
  candidate_causes:
    - "code: column-flex pane root + Orca's inline px width (confirmed)"
    - "code/css: scoped body rule height 100dvh on the part node (confirmed)"
    - "config/environment: window size or DPR (ruled out: red at 1280x768 headless and at the owner's 2556 px)"
    - "data: no project (ruled out as cause: red with projects too; it only shortens the sidebar)"
  and_gate: "yes: two contributing conditions (node height and surface layout) for the vertical half; either alone
    leaves the surface short of or beyond the visible body; both are fixed."

## Symptoms

DATA_START
expected: Orca mode shows Orca's workspace UI filling its panels, as Orca's own client does.
actual: On a fresh profile, with Orca mode selected and no Orca project added:
  1. The left Theia side panel is about 400 px wide. Orca's Workspaces sidebar inside it renders about 270 px wide and
     about 340 px tall (Search, Onboarding checklist, Tasks, Automations, Orca Mobile "New", Projects with its four
     icons, "No workspaces found", a footer icon row). The rest of the panel, to the right of it and below it, is black.
     A Theia "SETTINGS" section header sits at the bottom of the panel.
  2. The main area shows Theia's Welcome tab (the address bar reads view:welcome), not an Orca surface. Its content is
     spread down the full height: the power logo at the top, "PowerBrowser" in the middle, "Version 1.76.0" lower, the
     https://powerbrowser.org link at the very bottom. This may be Orca CSS reaching Theia or the Welcome page's own layout.
  3. The right panel shows four Orca icons and "Select a workspace to browse", right-aligned and clipped at the panel
     edge, above a black area.
errors: none on screen. Launch log: .mozbuild/pb-live-profiles/owner-5906.log.
reproduction: dev build objdir/dist/bin/powerbrowser at HEAD 1ef75400, ORCA_* unset, launched as
  MOZ_PURGE_CACHES=1 ./objdir/dist/bin/powerbrowser -purgecaches -no-remote -profile .mozbuild/pb-live-profiles/owner-5906 https://example.com
  then the Orca mode button. That instance may still be running (do not kill it without need; a second instance needs
  its own profile folder under .mozbuild/pb-live-profiles/).
screenshot: /tmp/claude-1000/-home-chris-orca-workspaces-Power-Browser-v1-7-Orca-integration/7bafc3f9-cc05-4051-bb79-ff9d1dca7657/images/2.png (2556x1527)
timeline: seen 2026-11-18. Gate run 5 the same day (da97a4e9) had orca-workspace-live, orca-side-panel-live and
  orca-pane-css-live green, so the live checks do not see this state.
DATA_END

## Checkpoint response (round 2, 2026-11-18)

DATA_START
Owner, with two screenshots (PowerBrowser in Orca mode on the fixed build: images/3.png; the real Orca app 1.4.263:
images/4.png, both in the session image folder):
"you can see that the right slide in Orca is not found in PB the togel is not there also the botom has the thiea
purpel bar witch should not be there"
DATA_END

Orchestrator's interpretation (not the owner's words):
- Symptoms 1 and 3 (side parts fill) and the Welcome spread are visibly fixed in images/3.png; the owner did not object.
  Recorded as fixed on his machine, not explicitly confirmed.
- The Orca parts are dark in images/3.png: the colour-scheme residual is answered as fine on his machine.
- NEW defect A: Theia's purple status bar shows at the bottom in Orca mode; the real Orca app has its own status bar
  there (usage, host count). Theia's must not show in Orca mode and must return in Coding, Browsing, Organising.
  Investigate whether the overlay can mount Orca's own status bar there without an Orca edit.
- NEW defect B: Orca's right-sidebar toggle. In Orca a PanelRight button at the top right opens/closes the right
  sidebar. In PB it must collapse/expand the Theia right panel hosting Orca's right sidebar, and while collapsed a
  control to bring it back must stay visible where an Orca user would look. Derive from Orca's store action and
  component.
- Still open, not acted on: Welcome vs Orca's Landing in the main area with no Orca tab.

## Questions this session must answer

- Which of the three symptoms are defects and which are the intended empty state? Sources: .planning/workstreams/orca/DECISIONS.md,
  the phase 64 and 65 UI specs and summaries under .planning/workstreams/orca/phases/, and the spike findings skill.
- Why do the live checks pass while the window looks like this (fresh profile, no project, launch with a URL argument,
  window size, mode entered by the button)?
- Fix the defects, and make a live check go red on each (CLAUDE.md "Verification": derive, compare, plant faults).

## Constraints

- CLAUDE.md hard rules: no Theia core edits, Gecko only through the patch stack, no custom browser chrome.
- Reproduce live; static gates cannot see DOM geometry (memory: run the sidecar standalone on :4000 with
  POWERBROWSER_TOKEN_DISABLE=1 and drive it with gsd-browser, or use the live harness in scripts/lib/).
- Edits to powerbrowser/shell/*.js need -purgecaches.
- Do not run scripts/verify-platform.sh --gate or --quick in full. Commit with explicit paths only; never amend, never stash.
- Avoid shell commands whose text contains the path fragment for the top-level requirements store directory; a hook blocks them.
- The owner judges the result on the machine; ask him through the AskUserQuestion box, never in prose.

## Eliminated

- hypothesis: Orca's scoped stylesheet reaches Theia and spreads the Welcome page (symptom 2)
  evidence: the spread is present in Browsing mode before Orca mode is entered, comes from @theia/getting-started's
    own .gs-container rule, and orca-pane-css-live measures 0 of 217 Theia values changed by Orca's sheet.
  timestamp: 2026-11-18
- hypothesis: the no-project state or the owner's window size causes the side-panel layout
  evidence: clause j is red with projects too and at 1280x768 headless as well as at the owner's 2556 px; no project
    only shortens Orca's sidebar content.
  timestamp: 2026-11-18

## Evidence

- timestamp: 2026-11-18
  checked: orca-overlay/files/src/renderer/src/pb/pb-pane-mount.tsx mountPane (lines 967-982)
  found: every mount kind, side kinds included, renders inside <div data-pb-orca-pane-root style="display:flex;
    flex-direction:column; width:100%; height:100%">. pb-side-mounts.tsx SidebarMount/RightSidebarMount render
    Orca's Sidebar / RightSidebar directly in it, with no wrapper.
  implication: the side surfaces get a column-flex parent.
- timestamp: 2026-11-18
  checked: orca/src/renderer/src/app-shell/AppWorkspaceShell.tsx; components/sidebar/index.tsx;
    components/right-sidebar/index.tsx; hooks/useSidebarResize.ts
  found: Orca mounts WorktreeSidebar inside 'flex flex-row flex-1 min-h-0' (or 'flex min-h-0 flex-1', also a row)
    and RightSidebar inside 'flex flex-row flex-1 min-h-0 overflow-hidden'. Sidebar's root is
    'relative min-h-0 flex-shrink-0 ... flex flex-col' and RightSidebar's 'relative flex-shrink-0 flex flex-row';
    useSidebarResize writes container.style.width = `${width}px` from the store (sidebarWidth, MIN 220 MAX 500;
    rightSidebarWidth clamped to the window, plus the side activity bar).
  implication: in Orca the row parent stretches the height and Orca's px width is the whole column width. Under a
    column parent the height collapses to content and the width stays Orca's px value regardless of the Theia part.
- timestamp: 2026-11-18
  checked: theia/node_modules/@theia/getting-started/src/browser/style/index.css:49-54 (upstream 1.76.0, pulled in
    by @theia/ai-ide since the 1.76 re-pin 2700e4c3) and theia/extensions/branding/.../powerbrowser-welcome-widget.tsx
  found: '.gs-container { display:flex; flex-direction:column; justify-content:space-between; height:100% }'.
    PB's welcome widget renders <div className='gs-container'> with four direct children (mark, h1, version, link).
  implication: the spread of symptom 2 is Theia's own rule on PB's widget, independent of Orca and of the mode.
- timestamp: 2026-11-18
  checked: scripts/verify-orca-side-panel-live.mjs and scripts/lib/orca-tabs-live.mjs
  found: withOrcaTabsSession always registers a scratch repository before fn runs (orca repo add), so no live row
    ever sees the no-project state. Clause a requires only that each part host has descendants
    ('.pb-orca-pane-host *'); no clause reads any bounding box. The harness launches --headless.
  implication: the checks pass because none of them measures whether a hosted surface fills its part, and none
    runs with no project.
- timestamp: 2026-11-18
  checked: .planning/workstreams/orca/phases/64-*/64-CONTEXT.md:207, 64-RESEARCH.md:119, 65-CONTEXT P65-10, mode-descriptors.ts
  found: "Route A shows no Orca landing page in PowerBrowser: Orca's app shell is never mounted"; P65-10: the
    'terminal' top-level view does nothing (page:creation only while a creation is pending); the Orca mode
    descriptor's comment: "The main area is shared across modes, so Orca's hosted panes show here".
    65-CONTEXT Deferred Verification: "Orca's sidebar ... and right sidebar look and behave as in Orca at the side
    panel's default width" was deferred to the end-of-milestone pass and never run.
  implication: no main-area Orca surface with no project is the recorded design; the side-panel look was never
    checked by anyone.
- timestamp: 2026-11-18
  checked: live reproduction, headless 1280x768, fresh profile, no repository registered (scratch probe
    probe-fresh-orca.mjs on withOrcaTabsSession({ registerRepo: false }), a harness option added for this), Orca
    mode entered through ModeService. Screenshot run1/orca.png in the session scratchpad.
  found: sidebar part node/host/root 244x768 at y=131 (the part body ends ~y=722); Orca surface 280x320, inline
    style width 280px, pane root 'flex column'. Right-sidebar part host 244x768; surface 350x53, inline width 350px
    (clipped on the right, which reads as right-aligned text). Part node background is Orca's body background.
    The node is 768 = 100dvh tall: Orca's base rule body { height: 100dvh; overflow: hidden } is mapped by
    pb-css-scope.mjs onto [data-pb-orca-pane], which the side widget's node carries; a main-area pane is sized inline
    by its Lumino layout, a part is not. Welcome .gs-container: display flex, column, justify-content space-between,
    in Browsing mode before Orca mode was ever entered (children at y 73, 314, 537, 737 of a 695 px box).
  implication: H1 confirmed (both width cases: owner's wide part -> black strip right; narrow part -> clipped), plus a
    second layer: the part node is a viewport tall, so a surface that filled the node would still lose its footer
    row below the part. H2 confirmed: the Welcome spread is mode-independent and not Orca CSS.
- timestamp: 2026-11-18
  checked: new clause j fill in scripts/verify-orca-side-panel-live.mjs (session now starts with no project; repos
    added after the no-project half), run on the UNFIXED build under the live lock
  found: "j fill: FAIL -- no project sidebar: node bottom edge +177px ...; surface right edge +36px (surface 280x320,
    body 244x591); surface bottom edge -271px; no project right-sidebar: node bottom edge +129px; surface right edge
    +106px (surface 350x52.5, body 244x639); surface bottom -586px; projects sidebar: node +227px, surface right +36px,
    bottom -107px ...". Clauses a-i all PASS in the restructured flow. Self-test: 16 plants red, 6 controls green.
  implication: the check is red on exactly the two defects behind symptoms 1 and 3, before any fix.
- timestamp: 2026-11-18
  checked: fix applied (orca-side-view.css + class on OrcaSideViewWidget), orca-panes and the Theia app rebuilt
    (tsc -b, theia build --mode development), orca-side-panel-live run twice, probe re-run (run2, run3 screenshots)
  found: "j fill: PASS -- every shown part's node and Orca surface fill its body (no project: 2 part(s); projects: 3
    part(s); wide 460px: 3 part(s))", clauses a-i PASS, 10 clauses. Probe: sidebar surface 244x591 = body, right
    sidebar 244x639 = body; screenshot shows Orca's footer row at the bottom of the part and the right sidebar's
    activity bar with its toggle and "Select a workspace to browse files" centred.
  implication: symptoms 1 and 3 fixed at both part widths; no regression in the side-panel clauses.
- timestamp: 2026-11-18
  checked: first-boot-surface welcome layout clause (new), unfixed then fixed welcome widget
  found: unfixed "welcome item 2 of 4 moved -67px ... 3 of 4 moved -133px ... 4 of 4 moved -200px when the seed's
    height shrank by 200px" (only failures); after wrapping the items in .gs-content-container: "first-boot-surface-fresh:
    PASS". Screenshot run3/orca.png: mark, name, version and link stacked at the top left with Theia's 20 px padding.
  implication: the Welcome spread is fixed in every mode.
- timestamp: 2026-11-18
  checked: orca-pane-css-live after the fix; scan-brand-residue (held-back Orca rows reconciled: 3113->3130,
    5606->5621, orcad 1785->1786, orca-side-view.css added to the Orca and orca rows); verify-branding-preflight and its
    self-test; orca-pane-css-self-test; orca-side-panel-live-self-test; first-boot-surface-self-test
  found: all PASS. orca-pane-css-live: Theia 0 of 217 changed, pane 0 of 126, side-panel probe 0 of 90.
  implication: the fix moves no Theia value and no Orca pane value outside the side parts' own geometry.
- timestamp: 2026-11-18 (round 2)
  checked: owner screenshots images/3.png (PB fixed build, Orca mode) and images/4.png (real Orca 1.4.263)
  found: PB's left and right Orca parts fill their parts and are dark; Welcome stacked at the top. PB's bottom row is
    Theia's purple status bar. Orca's bottom row is its own status bar (usage 'Used 24% 3d 22h', host count). Orca's
    right sidebar has its PanelRight toggle at the top right of its header row; PB shows Orca's toggle at the top right
    of the hosted right sidebar, under Theia's right-panel tab row.
  implication: symptoms 1 and 3 and the Welcome spread read as fixed on the owner's machine; colour scheme fine there.
- timestamp: 2026-11-18 (round 2)
  checked: theia/extensions/modes/src/browser/mode-service.ts activateMode, SHIPPED_MODE_RULES; chrome-bar
    side-panel-top-tabs.ts; layout-controls-widget.tsx
  found: one rule `furniture` drives both the status bar (statusBarWidget.setHidden(!rules.furniture)) and the two
    side containers (container.setHidden(!rules.furniture || dockPanel.isHidden)). The orca row has furniture: true
    because its side panels need their containers. With TopTabsSidePanelHandler the "rails" are the whole side
    containers (header row + dock), so furniture false would hide Orca's side panels too. In Orca mode the menubar row
    also shows PB's layout controls (Toggle Left/Bottom/Right Panel, Manage).
  implication: A's cause: the status bar has no rule of its own; Orca mode inherits Coding's status bar through the
    furniture flag it needs for its side panels.
- timestamp: 2026-11-18 (round 2)
  checked: orca/src/renderer/src/components/right-sidebar/index.tsx, right-sidebar-top-activity-bar.tsx,
    app-shell/TitlebarMainStrip.tsx, AppWorkspaceShell.tsx, store/slices/editor/actions/right-sidebar-state.ts,
    hooks/useSidebarResize.ts
  found: Orca's close button (PanelRight, aria-label 'Toggle right sidebar', class sidebar-toggle) is rendered by
    RightSidebar only while rightSidebarOpen; it calls toggleRightSidebar (set rightSidebarOpen = !open). Closed,
    RightSidebar renders no panel content and no close button, and useSidebarResize writes width 0px; Orca's shell then
    shows RightSidebarToggle (same icon/label, calls toggleRightSidebar) at the top right of the workspace area
    (AppWorkspaceShell: absolute top-0, right var(--window-controls-width), h-36) or at the right end of the titlebar
    strip (TitlebarMainStrip). Several Orca actions call setRightSidebarOpen(true) (checks panel, plugin view, reveal).
    Store default false; persisted-UI default true.
  implication: PB hosts RightSidebar but neither TitlebarMainStrip nor AppWorkspaceShell, so the closed state has no
    control at all, and the open/closed flag is not connected to the Theia right panel.
- timestamp: 2026-11-18 (round 2)
  checked: live reproduction, scratch probe probe-ab.mjs (headless 1280x768, fresh profile, no project; screenshots
    ab-before/ in the session scratchpad)
  found: Orca mode: #theia-statusBar 1280x22 at y=746, background rgb(104,33,122), StatusBarImpl.isHidden false.
    One 'Toggle right sidebar' button, inside the right panel at (1240,113). After clicking it: the Theia right panel
    stays expanded (244 px), the hosted surface's text goes from 'Select a workspace to browse files' to '' (activity
    icons only), and no 'Toggle right sidebar' button exists anywhere. Theia's Toggle Right Panel collapses and
    re-expands the panel, but the hosted surface stays empty afterwards (Orca's flag stays false; nothing in PB sets it).
  implication: A and B both reproduce deterministically. B is worse than "no toggle": one click on Orca's own button
    leaves the right panel empty with no way back short of an Orca action that opens the sidebar.
- timestamp: 2026-11-18 (round 2)
  checked: new clauses k (status bar) and l (right toggle) in scripts/verify-orca-side-panel-live.mjs, self-test
    (28 plants red naming the drift, 8 controls green), then the live row on the UNFIXED build under the live lock
  found: "k status bar: FAIL -- Orca selected: Theia's status bar shows in the Orca mode (22px high, hidden flag
    false); ... the side areas end 22px above the shell's bottom edge ...; Orca after Coding and Browsing: (same)".
    "l right toggle: FAIL -- Orca's close button: the Theia right panel stayed expanded; the Orca toggle: not reached;
    Theia's Toggle Right Panel (collapse): ... no Orca toggle is shown to bring it back; Theia's Toggle Right Panel
    (expand): the right panel opened without Orca's sidebar content (Orca's close button absent: its open flag stayed
    off)". Clauses a-j, h, i PASS.
  implication: both checks are red on exactly defects A and B before any fix.
- timestamp: 2026-11-19 (round 2)
  checked: fix applied (mode-service.ts statusBar rule; overlay B-8 API + right-sidebar-toggle kind; OrcaSidePanelSync
    (f); OrcaRightSidebarToggleHost), Orca pane bundle rebuilt (build-orca.sh --panes-only, then build-orca-panes.sh
    --standalone and build-orca-browser-host.sh), Orca web typecheck (tsc -p config/tsconfig.tc.web.json, 0 errors),
    modes and orca-panes tsc -b, Theia app rebuilt; orca-side-panel-live run three times, A/B probe re-run (ab-after/)
  found: first green attempt was red for a harness reason, not the fix: build-orca-panes.sh alone empties pb-panes/
    and removed pb-browser-host.js, so every hosted part showed the failure page ("couldn't connect Orca's agents to
    its web tabs"); build-orca.sh --panes-only (which re-runs the browser-host step) restored it. Then:
    "k status bar: PASS -- Theia's status bar hidden and its row reclaimed in 2 Orca pass(es); shown in Coding
    (control)"; "l right toggle: PASS -- Orca's close button collapsed the right panel, Orca's toggle at the main area's
    top right reopened it with Orca's content, Theia's Toggle Right Panel kept Orca's flag in step both ways, no toggle
    in Coding"; a-j, h, i PASS; 12 clauses. Probe: bar display none, side areas reach y=768; after Orca's close the
    panel is collapsed and one 'Toggle right sidebar' button sits at (1240,78) 32x24, outside the right panel; Theia's
    Toggle Right Panel reopens with 'Select a workspace to browse files'. With a Theia editor open the top-right tab
    bar gets padding-right 40px = the host width, so the toggle covers no tab or action (room2/room.png).
  implication: A and B fixed headless; no regression in the side-panel clauses.
- timestamp: 2026-11-19 (round 2)
  checked: adjacent rows, each with --only: gui07-mode-toggle-commands (+self-test), gui07-mode-switch-tabs-invariant
    (+self-test), shell-furniture, orca-overlay, orca-overlay-built, orca-pane-entry (+self-test), orca-pane-css,
    orca-side-panel-live-self-test, orca-pane-standalone-live, orca-pane-css-live, ng-035-custom-mode-saves-layout,
    branding-preflight, scan-brand-residue (+self-test; held-back Orca rows reconciled 3130->3239, 5621->5662,
    1255->1266 and the new file added to the three rows' only_in and expected_files)
  found: all PASS. orca-pane-standalone-live mounted 14 gate kinds x 2 routes (right-sidebar-toggle included);
    orca-pane-entry: C3 exports exact with the two B-8 names, no EditorPanel/EditorContent, app-root dialogs all hosted.
  implication: the new kind, API and status-bar rule move nothing outside their own surfaces.
- timestamp: 2026-11-19 (round 2)
  checked: Orca status bar (the orchestrator asked whether the overlay can mount it where Orca shows it):
    app-shell/AppRootSurfaces.tsx, components/status-bar/StatusBar.tsx, StatusBarSurface.tsx,
    use-status-bar-controller.ts; Theia application-shell.js createLayout
  found: Orca renders StatusBar (lazy) in AppRootSurfaces inside OverlayBoundary 'overlay.status-bar', gated on the
    store's statusBarVisible; it is store-driven (rateLimits, settings, statusBarItems ...) with segments for usage,
    plugins, caffeinate, remote-server and skill updates, native-chat resume, Orca app updates, pet, resource usage,
    ports, SSH and the floating-terminal toggle. Theia's shell is a BoxLayout [topPanel, side areas, statusBar], so a
    host widget can be inserted beside Theia's bar through the public Lumino API (no core edit), and a bundle kind can
    render Orca's StatusBar as AppRootSurfaces does (no Orca edit).
  implication: feasible, but not a defect fix: the Orca app-update segment and the floating-terminal toggle (shown when
    the user sets floatingTerminalTriggerLocation 'status-bar') would act on things PowerBrowser does not host, and
    usage depends on what PB's orcad can read. Left as an owner call; the defect (Theia's bar in Orca mode) is fixed.

## Resolution

root_cause: |
  Symptoms 1 and 3 (one defect, two contributing conditions): (a) OrcaSideViewWidget's node carries
  data-pb-orca-pane, onto which pb-css-scope.mjs maps Orca's base body rule (height: 100dvh; overflow hidden), so a
  side part's node was a viewport tall (a main-area pane is sized inline by Lumino, a part is not); (b) mountPane's
  pane root is a column flexbox, while Orca designs Sidebar and RightSidebar for a row-flex column and writes their
  width inline from its store (sidebarWidth 280, rightSidebarWidth 350): the surfaces took content height and Orca's
  stored width, leaving Orca's body background (black in dark) beside and below them in a wide part, and clipping
  them in a narrow one.
  Symptom 2, layout: since the 1.76 re-pin (2700e4c3) @theia/ai-ide brings @theia/getting-started, whose
  .gs-container rule is a full-height flex column with space-between; PB's welcome widget put its four items
  directly in .gs-container (Theia's own widget nests them in .gs-content-container), so they spread over the full
  height in every mode. Not Orca CSS.
  Symptom 2, content (Welcome rather than an Orca surface) and the content of 1 and 3 (Search, Onboarding checklist,
  Tasks, Automations, Orca Mobile, Projects, "No workspaces found"; four icons and "Select a workspace to browse
  files") are the intended empty state: Orca renders the same sidebar and right sidebar with no project, and the
  recorded design shows no Orca landing page in PowerBrowser (64-CONTEXT:207, 64-RESEARCH:119, P65-10, P64-18 shared
  main area). Whether the owner wants Orca's Landing in the main area is an open owner question.
  Round 2 (owner 2026-11-18, after relaunching the fixed build):
  A (defect): Theia's status bar showed in the Orca mode because the mode rules had no status-bar rule; activateMode
  hid the bar with !rules.furniture and the orca row needs furniture: true for its side containers (the top-tabs side
  panels are the containers). Fixed in 94e23217 (statusBar rule; orca false; custom rows fall back to furniture).
  B (defect, AND of two causes): Orca's right-sidebar toggle flips rightSidebarOpen in Orca's store, which nothing
  connected to the Theia right panel hosting RightSidebar, so a click emptied the panel and removed the toggle; and
  Orca's closed-state RightSidebarToggle (TitlebarMainStrip/AppWorkspaceShell) was not hosted, so no Orca control
  remained. Fixed in fa82a7f7 (bridge both ways while the active mode docks Orca's right container; Orca's own toggle
  at the main area's top right while the panel is collapsed).
  Why the checks missed A and B: no live row looked at Theia's status bar in the Orca mode or clicked Orca's toggle;
  65-CONTEXT's "look and behave as in Orca" pass was deferred and never run.
  Why the live checks passed: no live row read any bounding box (orca-side-panel-live clause a requires only that a
  part host has descendants; orca-pane-css-live counts computed-value changes, not geometry), and every Orca live row
  registered a repository before its first clause, so none saw the no-project state. The welcome's look had no
  check; 65-CONTEXT deferred "look as in Orca at the side panel's default width" to an end-of-milestone pass that had
  not run.
fix: |
  46c4d70d: theia/extensions/orca-panes/src/browser/side-panel/orca-side-view.css (new; .pb-orca-side-view
  { height: 100% }; its pane root's first child { flex: 1 1 0%; min-height: 0; width: auto !important }), class
  pb-orca-side-view added by OrcaSideViewWidget; orca-side-panel-live clause j; withOrcaTabsSession registerRepo
  option; inventory held-back Orca counts. 91956f91: the welcome widget nests its items in Theia's
  .gs-content-container; first-boot-surface welcome layout clause.
  Round 2: 94e23217 (A): ModeRules.statusBar (coding true; browsing, organising, orca false); activateMode hides the
  bar with !rules.statusBar; custom rows read statusBar or fall back to furniture; Save as Mode stores the active
  mode's furniture rule and the bar's visibility. fa82a7f7 (B): overlay pb-workspace-api.ts B-8
  (subscribeRightSidebarOpen, null until persistedUIReady; setRightSidebarOpen, Orca's own action), re-exported by
  pb-pane-mount.tsx; pb-side-mounts.tsx kind right-sidebar-toggle = Orca's RightSidebarToggle; orca-panes
  OrcaSidePanelSync (f) (Orca flag <-> Theia right panel while the active perspective places Orca's right container on
  the right; tabBar.currentChanged and onDidChangePerspective as triggers; first post-hydration value is the starting
  state); orca-right-sidebar-toggle.ts (host at the main area's top right, top-right tab bar padded by the host width);
  orca-side-view.css host rules; orca-side-panel-live clauses k and l; orca-pane-entry C3 list; inventory counts;
  registry note.
  Design choice recorded (closest to the real Orca app): the closed-state control is Orca's own RightSidebarToggle at
  the top right of the area Orca calls its workspace (Theia's main area), as AppWorkspaceShell places it, rather than a
  PowerBrowser button; PB's layout-control "Toggle Right Panel" in the menubar row stays as it was and now also keeps
  Orca's content in step.
verification_round2:
  target_test: { result: pass, note: "orca-side-panel-live k status bar and l right toggle: red on the unfixed build (k: bar 22px and its row reserved in both Orca passes; l: close left the panel expanded, no toggle, Theia's reopen without content), green after (12 clauses)" }
  mutation_check: { result: skipped, reason_if_skipped: "no Stryker; the red run on the unfixed build fails each l step the two causes predict (bridge: close/reopen steps; host: no-toggle steps) and k on both bar conditions; self-test plants each failure mode (28 red, 8 controls green)" }
  no_op_deletion: { result: pass, deletion_justified_by_rca: n/a (additive rule, API, kind, host) }
  adjacent_tests: { result: pass, suites_run: [orca-side-panel-live a-j h i, gui07-mode-toggle-commands (+self-test), gui07-mode-switch-tabs-invariant (+self-test), shell-furniture, orca-overlay, orca-overlay-built, orca-pane-entry (+self-test), orca-pane-css, orca-pane-standalone-live, orca-pane-css-live, ng-035-custom-mode-saves-layout, branding-preflight, scan-brand-residue (+self-test), Orca web typecheck] }
  revert_and_reconfirm: { result: pass, bug_returned_on_revert: true, fixed_on_reapply: true, note: "same row red on the build before the fix and green on the build with it, the fix the only change between the runs" }
  live_on_owner_machine: not run (headless 1280x768 light only; no owner instance was running; dev build rebuilt for his relaunch)
  guardrail_verdict: accepted
verification:
  target_test: { result: pass, note: "orca-side-panel-live j fill and first-boot-surface-fresh welcome layout, red before, green after" }
  mutation_check: { result: skipped, reason_if_skipped: "no Stryker in this tree; per-rule necessity shown by the red run's per-edge failures (node bottom <- rule 1, surface right <- width override, surface bottom <- flex)" }
  no_op_deletion: { result: pass, deletion_justified_by_rca: n/a (additive CSS and one wrapper element) }
  adjacent_tests: { result: pass, suites_run: [orca-side-panel-live a-i, orca-pane-css-live, verify-branding-preflight + self-test, scan-brand-residue, orca-pane-css-self-test, orca-side-panel-live-self-test, first-boot-surface-self-test] }
  revert_and_reconfirm: { result: pass, bug_returned_on_revert: true, fixed_on_reapply: true, note: "same check red on the build without the fix, green on the build with it; the fix was the only change between the runs (no git stash used, per the session constraint)" }
  live_on_owner_machine: not run (headless 1280x768 light only; the owner's running instance was left untouched)
  guardrail_verdict: accepted
files_changed:
  - theia/extensions/orca-panes/src/browser/side-panel/orca-side-view.css
  - theia/extensions/orca-panes/src/browser/side-panel/orca-side-view-widget.tsx
  - theia/extensions/branding/src/browser/powerbrowser-welcome-widget.tsx
  - scripts/verify-orca-side-panel-live.mjs
  - scripts/verify-first-boot-surface.mjs
  - scripts/lib/orca-tabs-live.mjs
  - inventory/brand-tokens.json
  - (round 2) theia/extensions/modes/src/browser/mode-service.ts
  - (round 2) orca-overlay/files/src/renderer/src/pb/pb-workspace-api.ts, pb-pane-mount.tsx, pb-side-mounts.tsx
  - (round 2) theia/extensions/orca-panes/src/browser/side-panel/orca-right-sidebar-toggle.ts (new),
    orca-side-panel-sync.ts, orca-side-view-widget.tsx, orca-side-view.css
  - (round 2) scripts/verify-orca-side-panel-live.mjs, scripts/verify-orca-pane-entry.mjs, scripts/verify-platform.sh
    (registry note), inventory/brand-tokens.json
residuals:
  - Orca's own resize handles (sidebar right edge, right sidebar left edge) stay in the DOM; a drag writes Orca's
    stored width with no visible effect. Not changed (no section hidden, P65-13 spirit).
  - (closed in round 2) Orca's right sidebar "Toggle right sidebar" button now collapses the Theia right panel.
  - Orca's left-sidebar toggle (TitlebarLeftControls) is not hosted; the left panel opens and closes through PB's
    layout control and the mode. Not reported by the owner.
  - Orca's own status bar is not mounted (feasible; an owner call, see Evidence 'Orca status bar').
  - Orca's workspace board drawer, positioned from sidebarWidth, was not opened.
  - Headless runs show Orca's surfaces in a light theme; the owner's screenshot (images/3.png) shows them dark on
    his machine, so the colour-scheme residual is answered there.
