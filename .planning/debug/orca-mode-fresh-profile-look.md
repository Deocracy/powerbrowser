---
status: awaiting_human_verify
trigger: "Owner, 2026-11-18, with a screenshot of the dev build on a fresh profile: 'Bit GUI problem. orca dose not look like orca'"
created: 2026-11-18T00:00:00Z
updated: 2026-11-18T23:30:00Z
---

## Current Focus

status_note: fixes for symptoms 1 and 3 (46c4d70d) and the Welcome spread of symptom 2 (91956f91) committed and
  verified live headless. Awaiting (a) the owner's look on his machine after a relaunch, (b) his ruling on symptom 2's
  content: Welcome (recorded design) or Orca's own Landing page in the main area while Orca mode has no Orca tab.
next_action: owner relaunches the dev build (the Theia bundle is rebuilt; no chrome JS changed) and answers the
  symptom-2 content question; on "keep Welcome" plus "looks right" -> archive; on "Orca's Landing" -> new
  investigation/plan for a hosted landing page (no Orca seam: Landing is an Orca component the overlay can mount).
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
residuals:
  - Orca's own resize handles (sidebar right edge, right sidebar left edge) stay in the DOM; a drag writes Orca's
    stored width with no visible effect. Not changed (no section hidden, P65-13 spirit).
  - Orca's right sidebar has its own "Toggle right sidebar" button; closing it from inside the part was not tested.
  - Orca's workspace board drawer, positioned from sidebarWidth, was not opened.
  - Headless runs show Orca's surfaces in a light theme beside Theia's dark one (Orca follows the OS scheme); the
    owner's dark machine was not re-checked.
