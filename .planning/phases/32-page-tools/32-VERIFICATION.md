---
phase: 32-page-tools
verified: 2026-11-01T00:00:00Z
status: human_needed
score: 17/20 must-haves verified (2 by override)
covered_files: [".planning/phases/32-page-tools/32-01-PLAN.md", ".planning/phases/32-page-tools/32-01-SUMMARY.md", ".planning/phases/32-page-tools/32-02-PLAN.md", ".planning/phases/32-page-tools/32-02-SUMMARY.md", ".planning/phases/32-page-tools/32-03-PLAN.md", ".planning/phases/32-page-tools/32-03-SUMMARY.md", ".planning/phases/32-page-tools/32-04-PLAN.md", ".planning/phases/32-page-tools/32-04-SUMMARY.md", ".planning/phases/32-page-tools/32-05-PLAN.md", ".planning/phases/32-page-tools/32-05-SUMMARY.md", ".planning/phases/32-page-tools/32-06-PLAN.md", ".planning/phases/32-page-tools/32-06-SUMMARY.md", ".planning/phases/32-page-tools/32-07-PLAN.md", ".planning/phases/32-page-tools/32-07-SUMMARY.md", ".planning/phases/32-page-tools/32-08-PLAN.md", ".planning/phases/32-page-tools/32-08-SUMMARY.md", ".planning/phases/32-page-tools/32-09-PLAN.md", ".planning/phases/32-page-tools/32-09-SUMMARY.md", "patches/050-extension-tab-host.patch", "powerbrowser/INTERNAL-APIS.md", "powerbrowser/shell/PowerBrowserAPI.sys.mjs", "powerbrowser/shell/powerbrowser.js", "scripts/check-internals-boundary.sh", "scripts/lib/pb-probe-verdicts.json", "scripts/verify-page-tools-downloads.mjs", "scripts/verify-page-tools-edit.mjs", "scripts/verify-page-tools-find.mjs", "scripts/verify-page-tools-live.mjs", "scripts/verify-page-tools-print-save.mjs", "scripts/verify-page-tools-reader-crash.mjs", "scripts/verify-page-tools-zoom-mute.mjs", "scripts/verify-platform.sh", "theia/extensions/chrome-bar/src/browser/address-bar/address-bar-modes.ts", "theia/extensions/chrome-bar/src/browser/chrome-bar-commands.ts", "theia/extensions/chrome-bar/src/browser/chrome-bar-copy.ts", "theia/extensions/chrome-bar/src/browser/chrome-bar-shortcuts.ts", "theia/extensions/chrome-bar/src/browser/chrome-bar-widget.tsx", "theia/extensions/chrome-bar/src/browser/tab-strip-widget.tsx", "theia/extensions/tab-uris/src/browser/web-tab.ts"]
covered_digest: "v3:sha256:6b960f5e831a16bd2b50dfbfb5330f4a1d8d42b5879dc0b7b9ed4d55efd5037c"
behavior_unverified: 1
overrides_applied: 2
overrides:
  - must_have: "Task 3 fixes the shared-process blank reload at the overlay's DidChangeBrowserRemoteness listener by re-asserting docShellIsActive"
    reason: "Root cause was the first-load race fixed by afda7df1; the activeness probe read active-after-switch; remoteness-repro verdict not-reproduced and the remoteness-regression row guard the user-facing outcome"
    accepted_by: "autonomous run under Chris's standing ruling (2026-10-31: take recommended options); owner to confirm at the end-of-milestone pass"
    accepted_at: "2026-11-01T00:00:00Z"
  - must_have: "the four-tab live workaround is dropped"
    reason: "Test-harness session cap only; the product defect it waited on is fixed; dropping it means re-proving two live suites (D-25b stays open, non-blocking)"
    accepted_by: "autonomous run under Chris's standing ruling (2026-10-31: take recommended options); owner to confirm at the end-of-milestone pass"
    accepted_at: "2026-11-01T00:00:00Z"
deferred:
  - truth: "Cut, copy, paste and undo work in a focused page from the Edit menu (ROADMAP SC2 clause, PAGE-09), with items greyed when the page reports them disabled (32-06 must-have)"
    addressed_in: "Phase 33"
    evidence: "REQUIREMENTS.md traceability row 'PAGE-09 | Phase 32, 33 (Edit menu, greying) | Pending'; 32-06-SUMMARY 'Orchestrator ruling (2026-10-31)'. WARNING: Phase 33's ROADMAP success criteria and its five written plans (33-01..33-05) do not mention an Edit menu, Edit entries or greying. The carry-over has no owning plan yet."
behavior_unverified_items:
  - truth: "A downloads button and panel list each download, which the user can open, show in its folder, cancel or retry (ROADMAP SC4, PAGE-06)"
    test: "Start a page download, open the Downloads button, and use Open and Show in folder on the finished row. Move through the rows with the arrow keys and press Esc"
    expected: "Open launches the file with the OS handler. Show in folder opens the file manager on the file. The arrow keys move between rows, Esc closes the panel and focus returns to the page, and the badge clears for finished rows once the panel is opened"
    why_human: "launch() and showContainingDirectory() are wired (PowerBrowserAPI.sys.mjs webTabDownloadAction) but start OS applications, so the live row does not call them. No UI scenario covers the panel on screen. Cancel, Retry and the no-silent-save row are proven live."
human_verification:
  - test: "Press Ctrl+F on a web page. Watch the page edge, then type a word and toggle Match case and Whole words"
    expected: "The 32px find strip sits under the bar and the page moves down by its height; nothing covers the page. The count changes when the toggles change the match set"
    why_human: "The page-rect shrink depends on top-panel layout and is not asserted live (32-02-SUMMARY). The case and whole-word flags are passed to the Finder but no live row asserts their effect"
  - test: "Press Ctrl+P on a focused web page, then cancel. Also run window.print() from page content"
    expected: "The OS system print dialog opens for that page and cancel does nothing else. window.print() has no shell path in this phase (D-09a)"
    why_human: "The live print row runs headless; the OS dialog needs a visible window (32-03-SUMMARY)"
  - test: "Favicons at 16px on the Browsing-mode strip and the Tabs-mode pill rows. Then switch to a non-Browsing mode with a web tab in the dock"
    expected: "Strip and pill rows show the site icon. Decide whether the dock tab bar must also show the favicon and the audio mark: today it shows codicon-globe and no audio mark or mute control (web-tab.ts:617,1208 set only title.iconClass)"
    why_human: "Visual look, plus a scope decision. ROADMAP SC3 names 'tabs, the strip and the pill', while 32-CONTEXT (line 203) scoped rendering to tab-strip-widget.tsx and the pill"
  - test: "Start objdir/dist/bin/powerbrowser by hand (not through the live harness) and play audio in a web tab"
    expected: "Sound plays, and the strip shows the audio mark and lets the user mute the tab"
    why_human: "32-REVIEW WR-10 (skipped): libxul cannot load libpulse outside the harness's LD_LIBRARY_PATH on this host, so DOMAudioPlaybackStarted never fires and no audio mark appears. The PAGE-05 live row proves audio only under the harness loader path. Decide whether PAGE-05 stands with this open; it is not recorded in WINDOWS.md"
  - test: "Toggle reader view on an article page in the light theme and in the dark theme"
    expected: "The toggle enables on article pages, enters and leaves reader view in the same tab, and is legible in both themes"
    why_human: "Visual look (32-08-SUMMARY deferred list)"
  - test: "Crash a web tab (about:crashcontent in a stock window, or the harness crash op). Check the crash UI, press Reload tab, then crash it again and navigate from the pill instead"
    expected: "The contracted copy 'This tab crashed. Reload to try again.' and the Reload tab button sit where the page was, never a blank page or the stock about:tabcrashed copy. After navigating, the new URL loads with the kept history behind it"
    why_human: "Crash UI placement and styling, plus WR-08 navigate-after-restore, need a human (32-REVIEW, 32-UAT.md)"
  - test: "Press F12 on a focused web page, press F12 again, then close the tab"
    expected: "One stock DevTools toolbox window opens for that page, a second F12 keeps one, and closing the tab closes it"
    why_human: "The toolbox window's look and behaviour on screen"
  - test: "Review the judgment-tier prohibitions that no gate covers (see the Prohibitions table)"
    expected: "Human confirms or rejects each non-authoritative verdict"
    why_human: "unverified-prohibition, human review recommended. Includes the 32-09 backstop process prohibition (no commit of the regenerated 050 before its rebuild), which only commit history can show; the build stamp passes today"
  - test: "Confirm or reject the two overrides (32-07 docShellIsActive re-assert closed as obsolete; D-25b four-tab harness cap kept)"
    expected: "Owner accepts both, or reopens either as follow-up work"
    why_human: "Accepted by the autonomous run under the standing ruling, not by the owner"
  - test: "Decide who owns the PAGE-09 carry-over"
    expected: "Phase 33's plans (or a new plan) include the Edit menu entries and the greying source, or PAGE-09 is re-scoped"
    why_human: "Owner decision. The ruling sends it to Phase 33, but Phase 33's success criteria and plans do not contain it"
---

# Phase 32: Page Tools Verification Report

**Phase Goal:** The tools Firefox offers around a web page (find, zoom, print, save, edit, audio, downloads, source, reader view, crash recovery) work on web tabs
**Verified:** 2026-11-01 (HEAD `cce1fa16`)
**Status:** human_needed (re-verified in-line after gap closure `59f61fd1`)
**Re-verification:** Yes. Initial run reported gaps_found (3). One in-line gap closure: F3 fixed in `59f61fd1`; gaps 2 and 3 closed by the overrides in the frontmatter

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1a | Ctrl+F opens a find bar with highlight all, match case, whole words and a match count | ✓ VERIFIED | Arms `webTabFind/FindNext/FindClose` (PowerBrowserAPI.sys.mjs:4855-4916) drive `finder.fastFind/findAgain/highlight/requestMatchesCount`. `renderFind` (chrome-bar-widget.tsx:757) has the three toggles and `{current} of {total}` or "Phrase not found". Live `find` row (Ctrl+F opens `#pb-chrome-bar-find-input`, F3 moves `findCurrent`, highlight on then off) is in the 16/16 run at HEAD |
| 1b | The find bar shrinks the page instead of covering it | ? UNCERTAIN | The strip renders inside `.pb-chrome-bar-host` under the 40px bar, and the rect follows the existing resize publish. The geometry is not asserted live, so it goes to human verification |
| 1c | F3 opens a find bar | ✓ VERIFIED (gap closed `59f61fd1`) | The `findNext`/`findPrevious` rows call `openFindBarFor(tab, false)` (opens the bar, focus stays on the page) and then step. The live `find` row now requires `#pb-chrome-bar-find-input` after F3 with the bar closed and then closes it before the Ctrl+F check: `--scenario find` PASS, `--self-test --only find` PASS with the new plant `find-f3-bar-closed` red naming 'did not open the find bar'. `--quick` exit 0 at the fix |
| 1d | Ctrl+plus, Ctrl+minus and Ctrl+0 zoom; a pill chip shows the level and resets it | ✓ VERIFIED | `webTabZoomReply` steps the live `zoomValues` ladder (:5307). PAGE_SHORTCUTS rows `zoomIn/zoomInPlus/zoomOut/zoomReset`. `renderZoomChip` shows the percentage only when the level is not 100% and resets on click. Live `zoom` and `keys-theia` pass |
| 2a | Ctrl+P on a web page opens the system print dialog | ✓ VERIFIED | `webTabPrintReply` calls the real `nsIPrintDialogService.showPrintDialog` and maps `NS_ERROR_ABORT` to a clean cancel. `printOpen` relay row. Live `print` passes. The OS dialog on screen goes to human verification |
| 2b | Ctrl+S saves the page to a place the user picks | ✓ VERIFIED | `webTabSavePick/Export` with `savePageCopy` and `IOUtils.copy` to the picked path. `saveOpen` row → `chooseSaveDestination` (Theia save dialog). Live `save` passes |
| 2c | Cut, copy, paste and undo from the Edit menu and the usual keys | DEFERRED (Phase 33) | Keys: `edit-today` verdict shows all seven commands work in content with no bridge traffic. Theia commands `edit-undo/cut/copy/paste` → `webTabEdit` frozen set; live `edit` passes. The Edit menu and greying are not built and are carried to Phase 33 by ruling (see Deferred) |
| 3a | Site favicons show on tabs, the strip and the pill | ✓ VERIFIED (Browsing strip + pill rows) | `webTabFaviconOf` reads the tab-host node image (data:image/, at most 64 KiB) → push → `safeIcon` `<img>` in tab-strip-widget.tsx:644 and pill rows (address-bar-modes.ts:104). Live `favicon` row checks the strip and the pill. The dock tab bar in other modes stays a globe, which needs a human scope decision |
| 3b | A playing tab shows it; the user mutes or unmutes from the tab or with Ctrl+M | ✓ VERIFIED | DOMAudioPlayback listeners → `soundPlaying`. `tabHostSetMuted` is the single mute path. The strip mark (tab-strip-widget.tsx:664) is keyboard-reachable (WR-11). `muteToggle` relay row. Live `audio` passes (harness loader path; see WR-10 human item) |
| 4 | Downloads button and panel; open, show in folder, cancel, retry; no silent page download | ⚠️ PRESENT_BEHAVIOR_UNVERIFIED | One chrome Downloads view push, a row per download, `cancel`+`removePartialData`/`retry` proven live (`downloads` passes). `launch`/`showContainingDirectory` are wired but never run. The panel on screen is unverified (32-04 is `partial`; PAGE-06 Pending) |
| 5a | Reader view opens on article pages | ✓ VERIFIED | `isArticle` accessor fed by AboutReaderParent; `Reader:ToggleReaderMode` on the AboutReader actor (:6685). Toggle enabled only on article pages or in reader view. Live `reader` and `crash-reader` pass |
| 5b | Ctrl+U shows the page source | ✓ VERIFIED | `webTabViewSourceReply` mints `view-source:` chrome-side from the overlay's own URL. The string `view-source:` appears in no Theia source (grep: 0). Live `source` passes |
| 5c | F12 opens the page's developer tools | ✓ VERIFIED | `DevToolsShim.showToolboxForTab(node, {hostType:"window"})` per the D-23 amendment. `devtoolsOpen` row. Live `devtools` passes |
| 5d | A crashed tab shows a reload button instead of a blank page | ✓ VERIFIED | `oop-browser-crashed` listener (:5200) → `crashed` push → `renderCrashed` (web-tab.ts:664) with contracted copy and Reload tab. Live `crash`, `crash-reader`, `crash-switching` and `crash-navigate` pass |
| P1 | 32-01: the three research probes recorded their verdicts before the build plans | ✓ VERIFIED | pb-probe-verdicts.json: `downloads-today`, `print-today` and `edit-today` are present |
| P2 | 32-04: the downloads view-push fix landed before the panel and the other UI | ✓ VERIFIED | Wave order in ROADMAP (32-04 is wave 2); the `downloads-today` verdict is kept as the pre-fix record |
| P4 | 32-07: blank reload fixed by a docShellIsActive re-assert at DidChangeBrowserRemoteness | ✓ PASSED (override) | Closed as obsolete in the 32-07 closure. The intent holds (`remoteness-repro` reads not-reproduced; the `remoteness-regression` row exists). Override suggested |
| P5 | 32-08: four-tab live workaround dropped (D-25b) | ✓ PASSED (override) | The cap is still in verify-ext-tab-host-live.mjs:11 and verify-site-identity-live.mjs:1620 |
| P6 | 32-09: tab host keeps mute, soundPlaying and zoom in sync for extensions; zoom shims; 050 regenerated | ✓ VERIFIED | `win.ZoomManager = {` (1 hit), FORBIDDEN_PATTERNS line, `tabHostSetMuted(` and `toggleMuteAudio` present. 050 keeps the URL wall (`isTabHostWindow(nativeTab.documentGlobal)`), and `sha256sum -c objdir/.pb-050-build.sha256` reports OK. The stand-in, scope and guard gates are green in `--quick`. The ext-mute and ext-zoom live rows ran at `d701a981`, and the mute and zoom code has not changed since (diff check) |
| P7 | 32-07/08: booleans-only readability signal, view-source wall, no custom inspector, crash UI without displayLoadError | ✓ VERIFIED | `verify-page-tools-reader-crash.mjs` and its `--self-test` (5 plants red) pass. The DevTools route follows the D-23 amendment recorded in 32-CONTEXT |

**Score:** 17/20 truths verified, 2 of them by override (1 present but behavior-unverified, 1 uncertain, 1 deferred, 0 failed)

Live-run caveat: the 16/16 `verify-page-tools-live.mjs` run and the 34-control/plant `--self-test` were recorded by the orchestrator and in 32-REVIEW at `842d379c`. I did not re-run them, as instructed. `git diff 842d379c cce1fa16` touches only 32-REVIEW.md, so those results apply to the code at HEAD.

### Deferred Items

| # | Item | Addressed In | Evidence |
|---|------|-------------|----------|
| 1 | PAGE-09 Edit menu entries and greying from the page's enabled state | Phase 33 (by ruling) | REQUIREMENTS.md traceability `PAGE-09 \| Phase 32, 33 (Edit menu, greying)`; 32-06-SUMMARY Orchestrator ruling. **Warning:** neither Phase 33's ROADMAP success criteria nor 33-01..33-05 contain it, so the carry-over has no owning plan yet |

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `powerbrowser/shell/PowerBrowserAPI.sys.mjs` | every webTab* page-tool arm, listeners, push fields, tab-host shims | ✓ VERIFIED | 16 arms at :4855-5045, each validating tabId and option types; substantive helpers (print service, Downloads view, savePageCopy, AboutReader actor, DevToolsShim) |
| `theia/extensions/tab-uris/src/browser/web-tab.ts` | widget methods + push subscriptions | ✓ VERIFIED | find/findNext/findClose/zoom*/setReader/viewSource/openDevtools/setMuted/print/edit/savePage/downloadAction; `applyState` takes the push fields |
| `theia/extensions/chrome-bar/src/browser/chrome-bar-widget.tsx` | find strip, zoom chip, reader toggle, downloads button and panel | ✓ VERIFIED | Rendered in `render()` at :1029-1053 |
| `theia/extensions/chrome-bar/src/browser/chrome-bar-shortcuts.ts` | page-focus relay rows | ✓ VERIFIED (except the F3 open) | Ctrl+F, F3, Shift+F3, Ctrl+=/+/-/0, Ctrl+M, Ctrl+P, Ctrl+S, Ctrl+U, F12 |
| `theia/extensions/chrome-bar/src/browser/tab-strip-widget.tsx` | favicon + audio mark | ✓ VERIFIED | :644 favicon, :664 audio mark |
| `scripts/verify-page-tools-{find,zoom-mute,print-save,downloads,edit,reader-crash}.mjs` | static gates with --self-test | ✓ VERIFIED | All six pass, and their self-tests turn 4/8/11/5/4/5 plants red (run by verifier) |
| `scripts/verify-page-tools-live.mjs` | live scenarios + plants | ✓ VERIFIED (recorded) | 16 scenarios; registered at verify-platform.sh:5111-5112 |
| `scripts/lib/pb-probe-verdicts.json` | probe verdicts | ✓ VERIFIED | downloads/print/edit-today, remoteness-repro, remoteness-activeness-probe |
| `patches/050-extension-tab-host.patch` | regenerated, URL wall kept | ✓ VERIFIED | Stamp OK |

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|----|--------|---------|
| handleWebTabAction | page-tool kinds | one case arm per kind | ✓ WIRED | The kind-set gates compare arms ↔ union ↔ WEB_TAB_ACTION_KINDS as set equality, and all are green |
| chrome-bar widget / shortcuts | web-tab.ts widget methods | method calls, never bare kind sends | ✓ WIRED | `tab.find/findNext/zoom*/setMuted/print/savePage/viewSource/openDevtools/downloadAction/setReader` |
| WebTabChannel `onPush('state')` | strip / pill / bar | `tabStatusEmitter`, `applyState` | ✓ WIRED | favicon, crashed, audio and zoom changes repaint |
| `onPush('downloadsChanged')` | downloads panel | `onDidChangeDownloads` → `downloadRows` | ✓ WIRED | Subscribed on every current-widget change to a web tab (chrome-bar-widget.tsx:1131) |
| overlay `oop-browser-crashed` | crash UI | `crashed` push → `renderCrashed` | ✓ WIRED | Reload tab → `reload()` → `recreate()` |
| F3 relay row | find bar open | `openFindBarFor` | ✗ NOT_WIRED | See gap 1 |

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
|----------|---------------|--------|--------------------|--------|
| find count | `findCurrent/findTotal/findStatus` | FinderParent result listener → page state → push | Yes (live find) | ✓ FLOWING |
| zoom chip | `zoom` | `browser.fullZoom` | Yes | ✓ FLOWING |
| strip favicon | `favicon` | tab-host node `.image` (LinkHandlerParent setIcon) | Yes (live favicon) | ✓ FLOWING |
| audio mark | `soundPlaying/audioMuted` | DOMAudioPlayback events / `browser.audioMuted` | Yes under the harness loader path | ✓ FLOWING (see WR-10) |
| downloads rows | `downloadRows` | `Downloads.getList(ALL)` view | Yes (live downloads) | ✓ FLOWING |
| reader toggle | `isArticle/isReaderMode` | AboutReaderParent → accessor; currentURI | Yes (live reader) | ✓ FLOWING |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| Static page-tool gates | `node scripts/verify-page-tools-<x>.mjs` and `--self-test` (×6) | all exit 0; plants red | ✓ PASS |
| Internals boundary | `bash scripts/check-internals-boundary.sh` | exit 0 | ✓ PASS |
| Brand residue | `node scripts/scan-brand-residue.mjs` | exit 0 | ✓ PASS |
| upstream untouched | `git -C upstream diff --quiet` | exit 0 | ✓ PASS |
| Commit gate | `nix develop .#theia --command scripts/verify-platform.sh --quick` | `verify-platform: PASS -- all checks passed` (3m18s) | ✓ PASS |
| 050 build stamp | `sha256sum -c objdir/.pb-050-build.sha256` | OK | ✓ PASS |
| Live page tools | not re-run (instruction); recorded 16/16 at 842d379c | n/a | ? SKIP (recorded evidence) |

### Probe Execution

No `scripts/*/tests/probe-*.sh` probes are declared. The phase's research probes are record-only live scenarios; their verdicts are in `pb-probe-verdicts.json`, and the instructions say not to re-run them.

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|------------|-------------|--------|----------|
| PAGE-01 | 32-01, 32-02 | Find with Ctrl+F and F3, toggles, count, page not hidden | ✗ BLOCKED (partial) | Find works; F3 does not open the bar (gap 1); the shrink is unverified |
| PAGE-02 | 32-01, 32-02, 32-09 | Zoom keys + pill chip | ✓ SATISFIED | Truth 1d |
| PAGE-03 | 32-02, 32-03 | System print dialog | ✓ SATISFIED (on-screen check pending) | Truth 2a |
| PAGE-04 | 32-07, 32-08 | Favicons on tabs, strip, pill | ✓ SATISFIED (dock tab bar scope pending) | Truth 3a |
| PAGE-05 | 32-01, 32-02, 32-09 | Audio mark + mute incl. Ctrl+M | ✓ SATISFIED (WR-10 decision pending) | Truth 3b |
| PAGE-06 | 32-04 | Downloads button/panel, open/show/cancel/retry | ? NEEDS HUMAN | Truth 4; REQUIREMENTS.md Pending |
| PAGE-08 | 32-02, 32-05 | Ctrl+S save, choose destination | ✓ SATISFIED | Truth 2b |
| PAGE-09 | 32-06 | Edit menu and keys | DEFERRED (Phase 33) | Keys + commands built; menu + greying carried; REQUIREMENTS.md Pending |
| PAGE-10 | 32-07, 32-08 | Reader, Ctrl+U, F12 | ✓ SATISFIED | Truths 5a-5c |
| PAGE-11 | 32-07, 32-08 | Crashed tab with reload button | ✓ SATISFIED | Truth 5d |

All 10 phase IDs appear in at least one plan's `requirements`. No orphans: PAGE-07 maps to Phase 35.

### Prohibitions

| Plan | Prohibition | Tier | Disposition |
|------|-------------|------|-------------|
| 32-01 | No browser.xhtml script load; no stand-in member | judgment | Enforced by gates (`FORBIDDEN_PATTERNS`, stand-in gate); grep finds no findbar/fullZoom/printUtils load. Verified |
| 32-02 | No zoom from prefs in Theia; no state kind from a bare command id; no mute on the pill | judgment | Bridge gate privileged-kind fence green; the pill has no mute. Non-authoritative pass, flagged |
| 32-03 | No tab-modal print, browserDOMWindow shim or wall widening | judgment | print-save gate plants (tab-modal + shim absence) red. Verified by test |
| 32-04 | No DownloadsPanel/DownloadsCommon; no unserialized Download push | judgment | grep: no instantiation; downloads gate green. Verified |
| 32-05 | No page bytes written from the Theia backend; no raw frontend path executed | judgment | `webTabSaveDestinationIsValid` plus the savePageCopy guard in the print-save gate. Non-authoritative pass, flagged |
| 32-06 | No webTabEdit from a bare command id; no clipboard read without a gesture; no page text echoed | judgment | The edit gate covers the frozen set; 32-06 says the Gecko paste-path clipboard read was not checked. Flagged |
| 32-07 | No privileged-scheme load from Theia input, no displayLoadError on a crash, no stock about:tabcrashed, no disabling of maychangeremoteness | judgment | reader-crash gate plants red. Verified by test |
| 32-08 | No view-source: in Theia, no network icon fetch, no custom inspector, no blank crashed tab | judgment | grep finds 0 `view-source:` in Theia; reader-crash and favicon plants. Verified by test |
| 32-09 | No new gBrowser literal member; nothing beyond the D-28 set | backstop | `verify-shell-gbrowser-standin.mjs` member-by-member compare is green in `--quick`. Verified (explicit test) |
| 32-09 | No browser-fullZoom.js / ZoomUI.init; FullZoom shim carries siteSpecific only | judgment | Grep finds no load. Non-authoritative pass, flagged |
| 32-09 | No text edit of 050; upstream writes only via guarded replay; no commit before the stamping rebuild | backstop | `upstream` diff clean, patch-surface gate green, stamp OK. Commit ordering is unproven. `insufficient_spec`, human |

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| scripts/verify-page-tools-find.mjs | 18 | `TODO (owned by plan 32-02)`: stale, because 32-02 pinned the find copy in verify-shell-error-copy.mjs | ⚠️ Warning | Misleading header comment only |
| theia/extensions/chrome-bar/src/browser/chrome-bar-widget.tsx | 913 | Downloads button `disabled={!currentWebTab()}` | ℹ️ Info | The panel cannot be opened while an editor tab is current |
| powerbrowser/shell/PowerBrowserAPI.sys.mjs | webTabSaveExportReply | refuses when two tabs share the page address | ℹ️ Info | Documented limitation of savePageCopy |
| powerbrowser/shell/PowerBrowserAPI.sys.mjs | :5201-5210 | WR-07 skipped: AboutReaderParent throw stops `tabs.onUpdated isArticle` for extensions | ⚠️ Warning | Recorded as a follow-up; no later phase claims it |
| 32-REVIEW IN-01..IN-07 | n/a | Info findings not in fix scope (IN-07: closing a crashed tab keeps its history in memory) | ℹ️ Info | None blocking |

No unreferenced TBD, FIXME or XXX markers in the lines this phase added.

### Human Verification Required

1. **Find strip geometry and toggles.** Ctrl+F on a page: the page moves down by the strip height, and Match case / Whole words change the count.
2. **System print dialog.** Ctrl+P opens the OS dialog for that page, and cancel is clean.
3. **Downloads panel.** On screen, with the keyboard, and Open / Show in folder (behavior-unverified truth 4).
4. **Favicons at 16px.** Check the strip and the pill. Also decide whether the dock tab bar in non-Browsing modes must carry the favicon and the audio mark.
5. **Audio on the shipped launch path (WR-10).** A hand-started binary plays no sound on this host, so no audio mark appears. Decide whether PAGE-05 stands.
6. **Reader toggle in both themes.**
7. **Crash UI look, and WR-08 navigate-after-restore.**
8. **DevTools toolbox window.**
9. **Flagged prohibitions.** Review them, including the 050 commit-ordering backstop.
10. **PAGE-09 owner.** Phase 33 plans do not yet contain the Edit menu or greying.

### Override Suggestions

Gaps 2 and 3 look intentional. To accept them, add to this file's frontmatter:

```yaml
overrides:
  - must_have: "Task 3 fixes the shared-process blank reload at the overlay's DidChangeBrowserRemoteness listener by re-asserting docShellIsActive"
    reason: "Root cause was the first-load race fixed by afda7df1; the activeness probe read active-after-switch; remoteness-repro verdict not-reproduced and the remoteness-regression row guard the user-facing outcome"
    accepted_by: "{name}"
    accepted_at: "{ISO timestamp}"
  - must_have: "the four-tab live workaround is dropped"
    reason: "Test-harness session cap only; the product defect it waited on is fixed; dropping it means re-proving two live suites"
    accepted_by: "{name}"
    accepted_at: "{ISO timestamp}"
```

### Gaps Summary

**Closure (2026-11-01):** the F3 gap below was fixed in `59f61fd1` and proven live (find row and its new plant); the two plan-level deviations were accepted as overrides under the standing ruling, for owner confirmation at the end-of-milestone pass. No gaps remain; the human items stand. The text that follows is the initial verdict.

The phase delivers most of its goal. Find, zoom, print, save, favicons, audio and mute, reader view, view source, DevTools and crash recovery are implemented end to end. Every arm validates its input, every gate is green with planted faults going red, and the recorded live suite covers each tool at HEAD code.

One real code gap blocks: **F3 does not open the find bar** (ROADMAP SC1, 32-UI-SPEC). It was known in 32-02 Deviation 6 and never carried anywhere. The fix is small: the `findNext`/`findPrevious` relay rows should open the bar before stepping, and the live find row needs a closed-bar F3 check.

Two plan-level must-haves were not built as written, and both look intentional. One is the docShellIsActive re-assert, which the 32-07 closure made obsolete; the other is dropping the four-tab harness cap. Accepting the overrides above clears both.

PAGE-06 stays human-gated (Open / Show in folder / panel on screen). PAGE-09's Edit menu and greying are deferred to Phase 33 by ruling, but Phase 33's criteria and plans do not include them yet. That needs an owner decision before Phase 33 runs, or the carry-over will be lost.

---

_Verified: 2026-11-01_
_Verifier: Claude (gsd-verifier)_
