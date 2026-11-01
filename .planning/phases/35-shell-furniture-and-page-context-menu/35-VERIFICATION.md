---
phase: 35-shell-furniture-and-page-context-menu
verified: 2026-11-01T00:00:00Z
status: human_needed
score: 5/13 must-haves verified (8 present and wired, behavior unverified)
covered_files: [".planning/phases/35-shell-furniture-and-page-context-menu/35-01-PLAN.md", ".planning/phases/35-shell-furniture-and-page-context-menu/35-01-SUMMARY.md", ".planning/phases/35-shell-furniture-and-page-context-menu/35-02-PLAN.md", ".planning/phases/35-shell-furniture-and-page-context-menu/35-02-SUMMARY.md", ".planning/phases/35-shell-furniture-and-page-context-menu/35-03-PLAN.md", ".planning/phases/35-shell-furniture-and-page-context-menu/35-03-SUMMARY.md", ".planning/phases/35-shell-furniture-and-page-context-menu/35-04-PLAN.md", ".planning/phases/35-shell-furniture-and-page-context-menu/35-04-SUMMARY.md", ".planning/phases/35-shell-furniture-and-page-context-menu/35-05-PLAN.md", ".planning/phases/35-shell-furniture-and-page-context-menu/35-05-SUMMARY.md", ".planning/phases/35-shell-furniture-and-page-context-menu/35-06-PLAN.md", ".planning/phases/35-shell-furniture-and-page-context-menu/35-06-SUMMARY.md", ".planning/phases/35-shell-furniture-and-page-context-menu/35-07-PLAN.md", ".planning/phases/35-shell-furniture-and-page-context-menu/35-07-SUMMARY.md", "powerbrowser/INTERNAL-APIS.md", "powerbrowser/shell/PowerBrowserAPI.sys.mjs", "powerbrowser/shell/powerbrowser.js", "powerbrowser/shell/powerbrowser.xhtml", "scripts/check-internals-boundary.sh", "scripts/verify-page-furniture-live.mjs", "scripts/verify-page-tools-edit.mjs", "scripts/verify-platform.sh", "scripts/verify-shell-furniture.mjs", "scripts/verify-shell-gbrowser-standin.mjs", "scripts/verify-shortcut-relay.mjs", "scripts/verify-web-tab-bridge.mjs", "theia/extensions/chrome-bar/src/browser/chrome-bar-copy.ts", "theia/extensions/chrome-bar/src/browser/chrome-bar-shortcuts.ts", "theia/extensions/chrome-bar/src/browser/chrome-bar-widget.tsx", "theia/extensions/chrome-bar/src/browser/page-context-menu.ts", "theia/extensions/tab-uris/src/browser/web-tab.ts"]
covered_digest: "v3:sha256:031dc16cf397830c87502af18ffe0ce168c8076d00df9a44a7f23c4534bffffa"
behavior_unverified: 8
overrides_applied: 0
behavior_unverified_items:
  - truth: "SC1: right-clicking inside a web page shows Firefox's context menu"
    test: "context-menu, menu-page-tools: right-click a link, an image, a video, a selection and a blank area in a web tab"
    expected: "The Theia-rendered menu carries the stock rows in stock order and labels for that target"
    why_human: "Capture, cancel and re-render of the stock popup is wired and gated against upstream, but no live run exists (35-03/04/05 SUMMARY: no objdir in the lane)"
  - truth: "SC1: each page-menu item works"
    test: "menu-page-tools, menu-edit, menu-spelling, menu-save, extension-entry, then the CR-01 and CR-02 live checks"
    expected: "Each row runs its action page-side or chrome-side; saves land after a slow dialog; edit rows act on the right-clicked frame"
    why_human: "The dispatcher, walls and the CR-01/CR-02 fixes are in the tree; every row's effect is a runtime behavior no test exercised"
  - truth: "SC1: right-clicking in the IDE still shows Theia's own menu"
    test: "menu-not-in-ide, background-menu: right-click in an editor, the explorer and over a background tab"
    expected: "Theia's menu opens; no page menu opens for a hidden tab"
    why_human: "Static: disablecontextmenu is set only on #powerbrowser-content (powerbrowser.xhtml:210) and a page menu is captured only from overlay actor data. The Theia-side outcome is not live-proven"
  - truth: "SC2: page forms show the form-history and saved-login autocomplete popup under the field"
    test: "autocomplete, saved-login, form-validation, paste-popup"
    expected: "The stock PopupAutoComplete panel opens under the field with entries; a saved login fills; the validation bubble and the paste popup open"
    why_human: "#PopupAutoComplete and #invalid-form-popup exist (powerbrowser.xhtml:182,185) and AutoCompleteParent's selected-browser check passes through getTabForBrowser (PowerBrowserAPI.sys.mjs:6637), but panel placement is not live-proven"
  - truth: "SC3: hovering an element with a title shows its tooltip"
    test: "tooltip-status, theia-hover-silent"
    expected: "The stock remoteBrowserTooltip opens at the pointer over page content and never over the IDE"
    why_human: "XULBrowserWindow.showTooltip is a faithful port (PowerBrowserAPI.sys.mjs:7889-7898) and installed on the AppWindow (:7903); no live run"
  - truth: "SC3: hovering a link shows the link status text"
    test: "tooltip-status, pip-close, and the WR-04 clearing check"
    expected: "The in-bar status line names the link and clears on leave, on a tab switch and on navigation"
    why_human: "setOverLink -> overLink push -> pageStatus render is wired (:7878-7886, chrome-bar-widget.tsx:520,1852); WR-04's clearers are untested live"
  - truth: "SC4: F11 on a web page makes the window full screen"
    test: "fullscreen-key, f11-keeps-debug"
    expected: "F11 in a page fullscreens the shell window; F11 in the IDE keeps its debug binding"
    why_human: "The page row (chrome-bar-shortcuts.ts:91,219) runs the registered Full Screen command (chrome-bar-commands.ts:479, merged with Phase 33), which sends store.fullScreen. The window state change is a runtime effect"
  - truth: "SC4: a page video entering fullscreen shows Firefox's warning and Esc leaves fullscreen"
    test: "element-fullscreen"
    expected: "The stock fullscreen warning shows with the origin, then Esc leaves fullscreen and the warning closes"
    why_human: "FullScreen.enterDomFullscreen/cleanupDomFullscreen and PointerlockFsWarning are upstream-parity ports (:8990-9047) with the warning markup (powerbrowser.xhtml:192-205); the Esc path is Gecko's and was not run"
human_verification:
  - test: "See 35-UAT.md (22 items): the three ROADMAP research probes, the nineteen live scenarios, the visual checks, the 35-REVIEW live items and the two open points"
    expected: "Each item passes, or the failing item is raised as a gap"
    why_human: "No live run has happened in this phase: the lane had no objdir, and the owner's rule defers browser-dependent checks to the end-of-milestone pass"
---

# Phase 35: Shell Furniture and Page Context Menu Verification Report

**Phase Goal:** The stock Firefox furniture that page actors look for is present on the shell window, so the page context menu, form autocomplete, tooltips and page fullscreen work in web tabs
**Verified:** 2026-11-01 (main, HEAD `9e054572`)
**Status:** human_needed
**Re-verification:** No, initial verification

No gap was found in the static tree. Every success criterion has its furniture, shim, actor wiring, gate and live scenario present and substantive. None has a live run: 35-02 through 35-07 each record "no objdir in this lane", and the owner's rule defers browser-dependent criteria to the end-of-milestone pass. Those truths are therefore present and wired but behavior-unverified, not failed.

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | SC1a: right-clicking in a web page shows Firefox's context menu | PRESENT_BEHAVIOR_UNVERIFIED | `window.nsContextMenu` shim (PowerBrowserAPI.sys.mjs:8200), `#contentAreaContextMenu` stub (powerbrowser.xhtml:179), 42 row ids from upstream in `PAGE_MENU_ROWS` (:7923-7982), pushed to `page-context-menu.ts`. `verify-shell-furniture` compares ids, order and strings with upstream. No live run (`context-menu` scenario exists) |
| 2 | SC1b: each menu item works | PRESENT_BEHAVIOR_UNVERIFIED | `webTabContextMenuAction` (:5193) -> `handlePageMenuAction` (:8273) with the pick walls (single use, 60 s, offered row). Rows: frontend (back, forward, reload, stop, save page, view source, bookmark), chrome (open, save, copy, media, edit, search, frame, inspect, extension entries). CR-01 (`state.saves`, :8284-8329) and CR-02 (`webTabEditContext`, :6687, used at :8561,:8591) fixes are in the tree. Live rows `menu-page-tools`, `menu-edit`, `menu-spelling`, `menu-save`, `extension-entry` never ran |
| 3 | SC1c: right-clicking in the IDE still shows Theia's menu | PRESENT_BEHAVIOR_UNVERIFIED | `disablecontextmenu` only on `#powerbrowser-content` (powerbrowser.xhtml:210), not copied onto overlays; menu captured only from overlay actor data. `menu-not-in-ide` and `background-menu` scenarios exist, not run |
| 4 | SC2: form-history and saved-login autocomplete popup under the field | PRESENT_BEHAVIOR_UNVERIFIED | `#PopupAutoComplete` (powerbrowser.xhtml:182), `#invalid-form-popup` template (:185), `autocompletepopup: "PopupAutoComplete"` (PowerBrowserAPI.sys.mjs:3325), `getTabForBrowser` over the tab host (:6637) for AutoCompleteParent's check. Scenarios `autocomplete`, `saved-login`, `form-validation`, `paste-popup` never ran |
| 5 | SC3a: hovering a `title=` element shows its tooltip | PRESENT_BEHAVIOR_UNVERIFIED | `XULBrowserWindow.showTooltip/hideTooltip` (:7889-7901) opening `#remoteBrowserTooltip` (powerbrowser.xhtml:176), assigned to the AppWindow (:7903). Scenarios `tooltip-status`, `theia-hover-silent` not run |
| 6 | SC3b: hovering a link shows the link status text | PRESENT_BEHAVIOR_UNVERIFIED | `setOverLink` -> `queue` -> `overLink` push, one per animation frame (:7836-7886) -> `onPush('overLink')` (chrome-bar-widget.tsx:520) -> `.pb-page-status` (:1852). WR-04 clearer registered (:7857). Not run |
| 7 | SC4a: F11 on a web page makes the window full screen | PRESENT_BEHAVIOR_UNVERIFIED | Relay row `fullscreen` VK_F11 (chrome-bar-shortcuts.ts:91) in both chrome (powerbrowser.js:452) and frontend; action runs `CHROME_BAR_FULL_SCREEN_COMMAND_ID` (:219), registered at chrome-bar-commands.ts:479 -> `toggleFullScreen` -> `store.fullScreen` (chrome-bar-widget.tsx:1264-1266). `verify-shortcut-relay` 44 rows agree. The WR-05 dead-command warning no longer applies on main (Phase 33 merged). Not run |
| 8 | SC4b: a page video entering fullscreen shows Firefox's warning; Esc leaves | PRESENT_BEHAVIOR_UNVERIFIED | `window.FullScreen.enterDomFullscreen/cleanupDomFullscreen` (:8990-9033), `PointerlockFsWarning.showFullScreen` (:9035), warning markup (powerbrowser.xhtml:192-205), `showWarning`/`closeWarning`, overlay hide exits fullscreen (:3899). `element-fullscreen` not run |
| 9 | 35-01: T-27-11 closed; every Phase 35 shim global has derived coverage before it lands | VERIFIED | `verify-shell-gbrowser-standin.mjs` PASS and `--self-test` PASS (plants incl. missing member, new upstream call, surplus member, two `PointerlockFsWarning` definitions, `XULBrowserWindow` without QueryInterface); `check-internals-boundary.sh` PASS |
| 10 | D-01: one installer, `PowerBrowserAPI.installShellFurniture(window)`, checked by a derived gate with `--self-test` | VERIFIED | `installShellFurniture` (:4073) -> `installShellFurnitureReceivers` (:7792) with per-installer `step` guards (WR-01 fix, :7803-7806); called once in powerbrowser.js (:75). `verify-shell-furniture.mjs` PASS (furniture set == wired set); `--self-test` PASS, plants (a) through (ai) each red naming the drift |
| 11 | Hard rules 1-3: no Theia core edit, no Gecko outside the patch stack, one anti-corruption layer, bridge shape intact | VERIFIED | `git -C upstream diff --quiet` exit 0; boundary and `--catalogue` PASS (WR-07 rows added for `wrapHandlingUserInput`, `Glean`, `new Localization`); `verify-web-tab-bridge` PASS (35 kinds); `scan-brand-residue` PASS (416 files); `verify-shell-error-copy`, `-contract`, `verify-permission-prompts` PASS |
| 12 | 35-REVIEW fix outcomes (2 critical, 7 warning) are in the tree | VERIFIED (static) | CR-01 `state.saves`, CR-02 `webTabEditContext`, WR-01 `step`, WR-03 `window.PointerLock` (:9049), WR-06 copy `pageMenuRowRefused` (chrome-bar-copy.ts:239) and `saveTargetExpired` (:246), WR-06 Inspect gating on `isEnabled`. `verify-page-tools-edit` PASS and `--self-test` 9 plants red; `verify-chrome-bar-commands` PASS (38 ids, call sites import the consts). Live proof of CR-01, CR-02, WR-03, WR-04, WR-06 is in 35-UAT.md |
| 13 | Live harness covers the lane's 19 scenarios and is registered | VERIFIED | `SCENARIOS` lists tooltip-status, theia-hover-silent, pip-close, context-menu, menu-not-in-ide, background-menu, menu-page-tools, menu-edit, menu-spelling, menu-save, extension-entry, freeze-frame, autocomplete, saved-login, form-validation, paste-popup, element-fullscreen, fullscreen-key, f11-keeps-debug (verify-page-furniture-live.mjs:2020-2040); rows `page-furniture-live` and `-self-test` at verify-platform.sh:5162-5163. Not executed (instruction) |

**Score:** 5/13 truths verified (8 present and wired, behavior unverified; 0 failed)

### Deferred Items

None. Later phases do not own any Phase 35 truth. Phase 36 and 37 depend on the installer but do not cover these criteria.

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `powerbrowser/shell/PowerBrowserAPI.sys.mjs` | installer, XULBrowserWindow, nsContextMenu, page-menu engine, still, FullScreen, PointerlockFsWarning, PointerLock | VERIFIED | All present at the lines cited above; not stubs |
| `powerbrowser/shell/powerbrowser.xhtml` | tooltip, menu stub, autocomplete panel, validation template, fullscreen and pointer-lock warnings | VERIFIED | ids at :176-205 |
| `powerbrowser/shell/powerbrowser.js` | installer call; F11 chrome row | VERIFIED | :75, :452 |
| `theia/extensions/chrome-bar/src/browser/page-context-menu.ts` | Theia-side menu renderer and pick handler | VERIFIED | `settle`, save two-step, refusal copy |
| `scripts/verify-shell-furniture.mjs` | derived gate with `--self-test` | VERIFIED | PASS; `--self-test` PASS |
| `scripts/verify-page-furniture-live.mjs` | 19 scenarios and plants | VERIFIED (not run) | by instruction |
| `powerbrowser/INTERNAL-APIS.md` | catalogue rows | VERIFIED | `--catalogue` PASS |

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|----|--------|---------|
| ContextMenuParent actor | `window.nsContextMenu` | contentData capture, stub cancel, rows push | WIRED | :8200-8260 |
| Theia menu pick | chrome dispatcher | `webTabContextMenuAction` (literal sender in one file) | WIRED | :5193; fenced by `verify-web-tab-bridge` |
| content `setOverLink` | in-bar status line | `overLink` push | WIRED | :7878 -> chrome-bar-widget.tsx:520 |
| content tooltip | `#remoteBrowserTooltip` | AppWindow `XULBrowserWindow` | WIRED | :7889, :7903 |
| F11 relay row | window fullscreen | Full Screen command -> `store.fullScreen` | WIRED | Phase 33 command present on main |
| DOMFullscreen actor | warning element | `FullScreen.enterDomFullscreen`, `PointerlockFsWarning` | WIRED | :8990, :9035 |
| Bookmark Page row | Phase 33 command | `CHROME_BAR_BOOKMARK_PAGE_COMMAND_ID` | WIRED | page-context-menu.ts:26,208; registered chrome-bar-commands.ts:451 |

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
|----------|---------------|--------|--------------------|--------|
| page menu rows | `facts` -> `items` | ContextMenuParent `contentData` | Yes, from the actor | FLOWING (static) |
| status line | `pageStatus` | `setOverLink` url | Yes | FLOWING (static) |
| fullscreen warning | origin from `documentPrincipal.originNoSuffix` | DOMFullscreenParent | Yes | FLOWING (static) |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| Furniture gate and plants | `node scripts/verify-shell-furniture.mjs` and `--self-test` | exit 0, plants (a)-(ai) red | PASS |
| Stand-in gate and plants | `node scripts/verify-shell-gbrowser-standin.mjs` and `--self-test` | exit 0 | PASS |
| Edit set | `node scripts/verify-page-tools-edit.mjs` and `--self-test` | exit 0, 9 plants | PASS |
| Chrome-bar commands | `node scripts/verify-chrome-bar-commands.mjs` | 38 ids, 27 labels | PASS |
| Shortcut relay | `node scripts/verify-shortcut-relay.mjs` and `--self-test` | 44 rows, 31 plants | PASS |
| Boundary | `bash scripts/check-internals-boundary.sh` and `--catalogue` | exit 0 | PASS |
| Bridge, copy, contract, prompts | `verify-web-tab-bridge`, `-shell-error-copy`, `-shell-error-contract`, `-permission-prompts` | exit 0 | PASS |
| Brand residue, upstream | `scan-brand-residue.mjs`; `git -C upstream diff --quiet` | exit 0 | PASS |
| Live scenarios, `--quick`, full driver | not run | n/a | SKIP (instruction; no live run) |

### Probe Execution

No `scripts/*/tests/probe-*.sh` is declared. The three ROADMAP research probes are live-only; their fallback status is in 35-UAT.md.

| Probe | Disposition |
|-------|-------------|
| Right-click in an overlay (research probe 3) | Fallback taken: no `context-menu timing:` line was ever measured; the 200 ms budget is enforced by design, measured later |
| G4b freeze-frame latency (probe 8) | Fallback taken: verdict "deferred" recorded in 35-VALIDATION.md; 50 ms deadline enforced in code (`PAGE_STILL_DEADLINE_MS`, :8770, late capture dropped) |
| Clipboard paste popup (probe 12) | Fallback taken: static answer in 35-06-SUMMARY (the `textActions.ftl` localization link gives the shell `document.l10n`); live `paste-popup` deferred |

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|------------|-------------|--------|----------|
| PROMPT-04 | 35-01, 03, 04, 05 | Right-click context menu in a web page | NEEDS HUMAN | Truths 1-3, 12; REQUIREMENTS.md still Pending |
| PROMPT-06 | 35-06 | Form-history and saved-login autocomplete popup | NEEDS HUMAN | Truth 4 |
| PROMPT-08 | 35-01, 02 | Tooltips and link-hover status | NEEDS HUMAN | Truths 5, 6 |
| PAGE-07 | 35-01, 07 | F11 and page fullscreen with the warning | NEEDS HUMAN | Truths 7, 8 |

All four IDs appear in plan frontmatter. REQUIREMENTS.md maps no other ID to Phase 35, so there are no orphans.

### Prohibitions

| Plan | Prohibition | Tier | Disposition |
|------|-------------|------|-------------|
| 35 (hard rule 1-2) | No Theia core edit; no Gecko edit outside the patch stack | test | `git -C upstream diff` empty, boundary gate PASS. Verified by test |
| 35-03/04 | No page-supplied target loaded with chrome privilege; privileged pick event-handler-only | judgment | Pick walls and `webTabContextMenuAction` fence in `verify-web-tab-bridge`. Non-authoritative pass, flagged for human review |
| 35-07 | Elevation by `wrapHandlingUserInput` only after a validated pick | judgment | Scoped and catalogued (WR-07). Non-authoritative pass, flagged |
| 35 (D-11) | Furniture section defines no `PopupNotifications` or `tabContainer` | test | Rule 4 plants red (rule 13 covers the prompt installer). Verified by test |
| 35 | Pointer lock must not be granted without a warning | judgment | `window.PointerLock` ported (:9049). Non-authoritative pass until the live check (UAT 18) |

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| (phase files) | n/a | No unreferenced TBD, FIXME or XXX in the shell, Theia or gate files the phase touched | none | none |
| PowerBrowserAPI.sys.mjs | 8560-8601 | IN-01: late G4b capture keeps running after the deadline | Info | Main-thread cost only; not in fix scope |
| scripts/verify-shell-gbrowser-standin.mjs | 648 | IN-02: IDL member regex misses multi-token return types | Info | Blind spot in a derived check; no such upstream method today |
| scripts/verify-shell-furniture.mjs | 58-62 | IN-03: rule 10 skips the fullscreen l10n ids set in code | Info | Gate coverage gap |
| web-tab.css / web-tab.ts | 75-82 | IN-05: freeze-frame still covers notification bars and is stretched | Info | Visible only while a Phase 37 bar shows and a menu is open |
| PowerBrowserAPI.sys.mjs | 8463-8541 | IN-06: extension `overrideContext`/`refresh()` not honoured | Info | EXT-08 edge behaviour |
| 35-REVIEW IN-04, IN-07 | n/a | Comment drift; rule 4 summary wording | Info | None blocking |

### Human Verification Required

22 items are in `35-UAT.md`: the three fallback research probes, the 19 live scenarios as one suite run plus the per-criterion checks, the four visual checks, the five 35-REVIEW live items, and the two open points (Edit submenu falls back to the top document while the hamburger is open; a stale first pick gives no message).

### Gaps Summary

No gaps. The static tree delivers all four success criteria end to end: the furniture is installed by one derived-and-gated installer, each actor finds its element or shim, and the chrome-to-Theia wiring is complete. The earlier WR-05 concern (F11 and Bookmark Page registered nowhere) is resolved on main because Phase 33 is merged and both commands are registered. Phase 35 cannot be marked achieved until the live run in 35-UAT.md is done, because every criterion is a runtime behavior in a browser.

---

_Verified: 2026-11-01_
_Verifier: Claude (gsd-verifier)_
