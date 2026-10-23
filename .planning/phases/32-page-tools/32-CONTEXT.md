# Phase 32: Page Tools - Context

**Gathered:** 2026-10-22
**Status:** Ready for planning
**Mode:** `--auto` (standing autonomous rule: every gray area takes the recommended option, recorded with a one-line reason)

<domain>
## Phase Boundary

The tools Firefox offers around a web page work on web tabs: find in page,
zoom with a pill chip, system print dialog, favicons, audio indicator and
mute, downloads button and panel, save page, in-page edit commands, reader
view / view source / page devtools, and crashed-tab reload (ROADMAP.md
Phase 32; requirements PAGE-01, PAGE-02, PAGE-03, PAGE-04, PAGE-05, PAGE-06,
PAGE-08, PAGE-09, PAGE-10, PAGE-11).

In scope: browser-element methods only (`finder`, `fullZoom`, `mute`,
`stop`, `reloadWithFlags`, `gotoIndex`); the wider state push carries the
new per-tab fields; new `webTab*` action kinds beside the Phase 27 kinds.
Not in scope: PAGE-07 fullscreen (Phase 35 with the fullscreen furniture);
MENU-03 / SMODE-07 menu and Actions-mode wiring (Phase 33 consumes the kinds
this phase builds); tab-menu Mute / Bookmark items (Phase 34); per-site zoom
memory and input-history ranking (Future Requirements, deferred).

Depends on Phase 31 (site panel, hamburger menu, `openStockPage` enum) and
Phase 31.1 (extension tab host: one tab element per overlay, `getTabForBrowser`
reversal, `setIcon`/`getIcon` and the LinkHandlerParent favicon path; host nodes
carry only the data fields `muted`, `muteReason` and `soundPlaying`, corrected
2026-10-23). Plans assume both exist and consume their pushes; they do not
rebuild them. Plan 32-09 adds the host members 31.1 leaves out: the mute and
`soundPlaying` sync, `toggleMuteAudio` and the shell zoom shims.

</domain>

<decisions>
## Implementation Decisions

### Recorded rulings that apply (REQUIREMENTS.md header, PROJECT.md Key Decisions, prior phases)
- Typed non-URL text may search (lifts 13-UI-SPEC "no new addressability scheme"); the chrome bar may write to Places, only through `PowerBrowserAPI` (lifts the read-only Places row). Places writes go only through `PlacesUtils.*`, never raw SQL, never a second writer in the Theia backend (Pitfall 11).
- Firefox keys that clash with Theia keys take the browser meaning only while a web page has focus; Theia keeps its meanings in editors, terminals and other non-web tabs (KEY-04, 2026-10-20 ruling, Phase 27 relay).
- Chrome-bar copy reads the configured application name, never a hard-coded brand; no internal identifier in user-facing text (BAR-14, 01-UI-SPEC contract).
- Stock Firefox toolkit popups in `powerbrowser.xhtml` are shell furniture, not authored browser chrome (rule 5 clarified) — not used by this phase (print takes the system-dialog branch, never tab-modal preview).
- Hard rules hold: no Theia core patch (`scripts/diff-theia-core.sh`); no Gecko change outside the patch stack (`git -C upstream diff` empty); Firefox internals only via `PowerBrowserAPI.sys.mjs` catalogued in `powerbrowser/INTERNAL-APIS.md` (`scripts/check-internals-boundary.sh`); design for the bridge (`TabUriRegistry` shape asserted); repo path contains no space; Theia is the default GUI with the stock window reachable via `window.open(url,'_blank')` and no custom chrome authored.
- Extension tab host is Phase 31.1 (Chris sign-off 2026-10-21, Phase 28 spikes): patch 050 is the one logic patch (D-74 amended); the getTabForBrowser-null / no-synthesised-tab rulings are reversed; while the IDE has focus the last web tab stays the extensions' active tab; 31.1 delivers the favicon path (`setIcon`/`getIcon`) and host nodes with only the data fields `muted`, `muteReason` and `soundPlaying`; this phase's plan 32-09 keeps those fields in sync, adds `toggleMuteAudio` and the shell zoom shims, and drops patch 050's two zoom skips (corrected 2026-10-23).
- The `127.0.0.1` token cookie is exempt from every clear-data kind and overlay loads to other loopback ports never carry it (technical ruling 2026-10-20) — downloads and save-as must not expose or delete it.
- Autonomous round-3 choices (recommended option taken, recorded 2026-10-23 with one-line reasons): (a) waves strictly sequential with matching depends_on, one plan per wave (N1 — shared-file phases run in order, never parallel, per the ROADMAP "phases run strictly in order" rule extended to plans); since the 2026-10-23 revisions (D-14b; D-28 amended) the execution order is 32-01 (w1) → 32-04 downloads (w2) → 32-09 extension tab-host mute and zoom (w3; after downloads, which D-14b fixes before anything else) → 32-02 (w4) → 32-03 (w5) → 32-05 (w6) → 32-06 (w7) → 32-07 (w8) → 32-08 (w9), plan files keeping their numbers; (b) Ctrl+P + Ctrl+S page-focus relay rows land in 32-02 before the 32-03 print / 32-05 save live scenarios (N2/N4 — keys exist before their proof; verify-shortcut-relay rule 6 narrowed to global bindings, page-scoped rows allowed by the powerbrowser.js disable-when-not-overlay discipline); (c) crash = oop-browser-crashed listener per overlay + contracted Theia crash UI over the overlay, never displayLoadError on the crashed overlay (N3 — crashed remote docShell is null; NOT_REMOTE-first swap the shell cannot perform; one crash UI at a time); (d) probes EXECUTED in 32-01 writing scripts/lib/pb-probe-verdicts.json that later plans read (W-A — ROADMAP "probes run first"); (e) remoteness repro before fix (W-B — the todo's order): its own live task at the start of 32-07 with a recorded verdict, the root cause named at file:line in D-25f (webIsolated=4 is the precondition, not the cause); (f) crash scenario names the scratch tab, crashes it via about:crashcontent, expects sibling-process overlays to crash too (W-C — names what must show and what else may).
- Privileged kinds are invoked only from widget event handlers; an action that changes state is never a bare command id (Phase 27 rule, 30-D7/D-26) — applies to every new `webTab*` kind below.
- Verification: one driver, one registry (`scripts/verify-platform.sh`); new checks derive expectations from the tree and compare as set equality, with a `--self-test` that plants faults and requires each one to go red naming the drift; never assert on the absence of a log line.

### Decided after research (autonomous, recommended, 2026-10-22)

#### Find in page (PAGE-01)
- **D-01: Theia-rendered find bar that shrinks the page rect instead of covering it.** Reason: roadmap criterion 1 and the gap-list exception already granted for the find bar.
- **D-02: Chrome side uses only `overlay.finder` (`fastFind` / `findAgain` / `highlight` / `requestMatchesCount` + result listener → push); no `browser.xhtml` findbar script is loaded.** Reason: STACK page-tools row; browser-element methods only per phase Notes.
- **D-03: Ctrl+F opens the bar, F3 / Shift+F3 step next / previous, Esc closes and clears the selection; highlight-all, match-case, whole-words and a `{current} of {total}` / phrase-not-found count ship in v1.5.** Reason: REQUIREMENTS PAGE-01 names exactly those controls.
- **D-04: Find keys take the browser meaning only while a web page has focus (`PAGE_KEYS` + relay + `powerbrowser.webTabActive` / pill-focus when-clauses); Ctrl+F in editors and terminals keeps Theia's find.** Reason: the 2026-10-20 clash ruling and KEY-04.

#### Zoom (PAGE-02)
- **D-05: Ctrl+plus / Ctrl+minus / Ctrl+0 zoom the active overlay via `overlay.fullZoom`; a chip in the pill shows the live level and one click resets it to 100%.** Reason: roadmap criterion 1 names exactly those keys plus the chip.
- **D-06: Session zoom only in v1.5 — no new ContentPrefService2 persistence work and no Theia zoom preference; the chip reflects the tab's live level.** Reason: Future Requirements defer per-site zoom memory.
- **D-07: `browser-fullZoom.js` is never loaded; steps come from the `toolkit.zoomManager.zoomValues` default.** Reason: phase Notes forbid loading it; it is a `gBrowser` chrome script.

#### Print (PAGE-03)
- **D-08: Print reproduces only the system-dialog branch (printsettings-service + printdialog-service + `BrowsingContext.print`) inside `PowerBrowserAPI`; tab-modal preview (`getTabDialogBox`) is never built.** Reason: STACK print row; the shell has no tab-dialog box and PAGE-07/fullscreen furniture is Phase 35.
- **D-08a (autonomous, recommended, 2026-10-22): the print probe decides the branch — on a print-today failure the executor reports a blocker (no stock-window print fallback is built in Phase 32); the success criterion "a print-today failure routes through the stock window fallback" is struck because the owner of that fallback (Phase 31 `openStockPage`) is an assumption, not landed code.** Reason: checker W4 — a criterion with no task is not a criterion; a missing dependency is a blocker, not a re-implementation (finding 3).
- **D-09 (autonomous, confirmed 2026-10-23, checker N2): Ctrl+P prints only while a web page has focus (page-focus `print-open` relay row in 32-02, before the 32-03 live print scenario); everywhere else it keeps Theia's Go to File.** Reason: KEY-04 and the clash ruling; `verify-shortcut-relay.mjs` rule 6 is narrowed to global bindings in the same task.
- **D-09a (autonomous, recommended, 2026-10-22): no browserDOMWindow shim and no `OPEN_PRINT_BROWSER` branch is added in Phase 32 — `window.print()` routing is asserted absent-with-reason unless an executor proves the stock `window.print()` → `BrowsingContext.print` path already reaches the overlay without one.** Reason: the shell carries no `nsIBrowserDOMWindow` and adds no stock popupsets as furniture; a new shim would need the Phase 27 FORBIDDEN_PATTERNS + stand-in policy the plans do not budget.

#### Favicons (PAGE-04)
- **D-10: Favicons flow from `LinkHandlerParent` → the Phase 31.1 tab host (real record per overlay) → Places, and reach Theia as a cached `data:image/` icon field in the wider state push; tabs, strip and pill render it.** Reason: roadmap Notes plus STACK favicon row; the getTabForBrowser-null ruling was reversed 2026-10-21 so `setIconFromLink` runs.
- **D-10a (autonomous, recommended, 2026-10-22): Phase 32 does not re-derive the favicon pipeline — it consumes the Phase 31.1 tab host's `setIcon` record + `onPush('state')` icon fields and renders through `safeIcon`/`iconFor`; if the host has not landed, the missing dependency is a blocker the executor reports.** Reason: the LinkHandler→host→Places chain is Phase 31.1's scope; rebuilding it here would duplicate the host.
- **D-11: Theia never fetches an icon over the network; rows reuse the `safeIcon` cap (bounded `data:image/`, else null → globe/search glyph per `iconFor`).** Reason: Phase 29 icon pipeline already gates this; keeps the endpoint allowlist untouched.

#### Audio and mute (PAGE-05)
- **D-12: Audio state comes from a `DOMAudioPlaybackStarted/Stopped` listener on each overlay element (same discipline as the existing `pagetitlechanged` listener) fanned out as a push; mute acts through `overlay.mute()` / `unmute()` / `audioMuted`.** Reason: STACK mute row; browser-element methods only.
- **D-13: A playing tab shows its audio mark on the tab and strip; mute toggles from the tab affordance or Ctrl+M scoped to web-tab focus.** Reason: REQUIREMENTS PAGE-05 names both surfaces plus the key.

#### Downloads (PAGE-06)
- **D-14: Research probes 4 (downloads), 6 (print) and 9 (edit commands) run first; if page-started downloads save silently today, that fix lands before the panel.** Reason: ROADMAP Research line makes the silent-download fix the phase gate.
- **D-14a (autonomous, recommended, 2026-10-22, checker W3): D-14 narrows the ROADMAP "before anything else in the phase" line to "the silent-download view-push fix lands before the downloads panel renders" — probes record first, the find/zoom/mute tracer may land alongside them, but no panel code lands before the fix.** Reason: ROADMAP's stricter line would serialize the whole phase behind one probe; the phase gate is specifically a no-silent-save invariant for the panel.
- **D-14b (revision, 2026-10-23, checker warning on the ROADMAP order): supersedes the D-14a relaxation. Plan 32-04 (downloads view-push + panel) runs at wave 2, immediately after the 32-01 probe and before every other Phase 32 plan; 32-02 → 32-03 → 32-05 move down one wave. The recorded `downloads-today` verdict is not re-run after the fix (re-running would overwrite the pre-fix evidence); 32-04 and 32-02 end their live chains with `git diff --exit-code -- scripts/lib/pb-probe-verdicts.json`, and the later live plans run `downloads` as regression.** Reason: ROADMAP Phase 32 says a silent page-started download "is fixed before anything else in the phase"; moving the plan meets that line literally and costs only the wave order, since 32-04 needs nothing from 32-02/32-03.
- **D-15: The panel lists `Downloads.getList(Downloads.ALL)` with an add/remove view push; each row offers open, show-in-folder, cancel and retry; no page-started download is saved without appearing there.** Reason: roadmap criterion 4 states the invariant verbatim.
- **D-16: No custom download-path UI in v1.5 — files land per Firefox's download behaviour and the panel acts on them; the downloads button lives in the chrome-bar composition.** Reason: keeps the phase to parity surfaces; path management is not a v1.5 requirement.

#### Save page (PAGE-08)
- **D-17: Ctrl+S on a web page saves the page through a new chrome-side kind to a user-picked destination; in editors and other non-web tabs Ctrl+S keeps Theia's save.** Reason: PAGE-08 plus KEY-04; destination picking is the requirement's "choose where it goes".
- **D-18: The destination picker is a Theia file dialog; the write itself stays chrome-side (extends the `savePageCopy` pattern, never a Theia-backend writer).** Reason: Pitfall 11 single-writer rule; Theia backend never writes page bytes directly.

#### Edit commands (PAGE-09)
- **D-19: Probe 9 decides per command; content-native editing (typing, caret, native undo) stays in content with no round-trip — only commands that need chrome help get kinds.** Reason: research probe 9 exists precisely because most edit keys need no bridge.
- **D-20: The Edit menu and the usual keys reach the focused page through the same page-focus-scoped relay as other browser keys; no clipboard-reading suggestion is built.** Reason: explicit Out of Scope row (privacy).

#### Reader view, view source, devtools (PAGE-10)
- **D-21: Reader view opens in the same overlay when the chrome-side readability signal says the page is an article; the toggle lives with the page tools.** Reason: PAGE-10; same-tab keeps back/forward history intact (`gotoIndex` still applies).
- **D-21a (autonomous, recommended, 2026-10-22): the readability signal is `Readerable.shouldCheckUri` + `isProbablyReaderable(document)` evaluated chrome-side on the overlay document (and the `Reader:UpdateReaderButton` actor message when the browser actors are registered); no page text crosses to Theia — only `{isArticle, isReaderMode}` booleans.** Reason: AboutReaderChild's own check is that pair (`AboutReaderChild.sys.mjs:233`), not `parseDocument`.
- **D-23: F12 (page-focus-scoped) opens the shell's stock DevTools path for the active overlay through Phase 31's `openStockPage` enum (Phase 31 assumption); no custom inspector is authored and no toolbox-window fallback is built here.** Reason: rule 5 (no custom browser chrome authored); Phase 31 owns the stock-window opener (checker W5).
- **D-23a (autonomous, recommended, 2026-10-22): view-source entry reuses the overlay's normal navigation (`fixupAndLoadURIString` with the chrome-minted `view-source:` URL + null principal) through the existing Phase 31 `openStockPage`-adjacent chrome load path — never a `ViewSource:LoadSource` actor message.** Reason: the ViewSource actor is child-only toolkit-wide with no parent (`ActorManagerParent.sys.mjs:576-583`); there is no chrome-side actor to send to.
- **D-22: View source loads `view-source:` chrome-side through a new kind in the active or a new tab; Theia never holds a `view-source:` URL across the scheme wall.** Reason: the `about:`/privileged-scheme wall (Out of Scope) — only chrome mints that load.
- **D-23: F12 (page-focus-scoped) opens the page's developer tools as a stock DevTools window for the active overlay; no custom inspector is authored.** Reason: rule 5 (no custom browser chrome authored); a custom inspector would be new chrome.
- **D-24: Ctrl+U views source only while a web page has focus; elsewhere it keeps any Theia binding it has.** Reason: clash ruling symmetry with Ctrl+P / Ctrl+S.

#### Crashed tab (PAGE-11)
- **D-25: A crashed overlay pushes a crashed flag and shows the CONTRACTED Theia crash UI over the overlay (N3/D-25e — never `displayLoadError` on the crashed overlay, never the stock `about:tabcrashed` copy beside it); the tab shows a reload button that calls the existing `webTabReload` path — never a blank page.** Reason: roadmap criterion 5; reload-with-history is the existing `webTabReload`, not a new restore path.
- **D-25a (autonomous, recommended, 2026-10-22, checker B1/W-B): Phase 32 owns the shared-process blank-reload todo (`.planning/todos/pending/2026-10-21-shared-process-blank-reload.md`, resolves_phase 32): the crash/reload plan REPRODUCES it first (five same-site tabs live, fifth blanks) naming the root cause (`dom.ipc.processCount.webIsolated=4` at `upstream/modules/libpref/init/all.js:1887-1889` — the fifth tab shares a process, frameloader swap leaves it at `about:blank`), THEN fixes the remoteness switch chrome-side, and keeps the scenario as a regression row.** Reason: the todo names Page Tools (reload/crash recovery) as owner and orders reproduce-before-fix; the defect weakens Reload.
- **D-25b (autonomous, recommended, 2026-10-22, checker B1): the "at most four web tabs on 127.0.0.1" live-session workaround is dropped once the remoteness fix lands; sessions after that use one origin.** Reason: the cap was workaround for the bug, not a design rule.
- **D-25c (autonomous, recommended, 2026-10-22, checker W7): crash copy is exactly `This tab crashed. Reload to try again.` with button `Reload tab` (32-UI-SPEC Copywriting Contract).** Reason: single source of truth for the string.
- **D-25d (autonomous, recommended, 2026-10-22, checker W4/B6/W-C): the live crash scenario names its scratch tab (a fifth overlay opened only for the scenario, never the session's four), crashes it by loading `about:crashcontent` chrome-side (pinned `nsAboutRedirector.cpp:49-50` — content-process `MOZ_CRASH`; sibling overlays sharing its process are expected to crash too and are recorded), and closes the scratch overlay after the verdict so the session continues.** Reason: stock `about:tabcrashed` needs `BrowserGlue`/`browser.js` the shell never loads; `about:crashcontent` is the tree's own crash-test hook.
- **D-25e (autonomous, recommended, 2026-10-23, checker N3): crash signal is ONE `oop-browser-crashed` addEventListener per overlay (fires on the element itself — needs no gBrowser) + the CONTRACTED Theia crash UI over the overlay WITHOUT touching docShell — never `browser.docShell.displayLoadError` on the crashed overlay and never the stock `about:tabcrashed` copy.** Reason: polling `isCrashed` never fires (a crashed process sends no further events); the crashed remote `docShell` is null (stock switches to `NOT_REMOTE` first at `ContentCrashHandlers.sys.mjs:545-552`, a swap no shell gBrowser performs); one crash UI at a time.
- **D-25f (revision, 2026-10-23, checker blocker W-B): the repro is its own task, 32-07 Task 1: rebuild Theia, run `--scenario remoteness-repro` (own session, five same-site tabs, reload and activation triggers, four runs each) on the unfixed tree, and record the verdict under `remoteness-repro` in `scripts/lib/pb-probe-verdicts.json`; it must start `reproduced`. 32-07 Task 3 reads it first, then fixes at the named line: the overlay is a `manualactiveness` browser (`PowerBrowserAPI.sys.mjs:3268`), Gecko gives the BrowserParent a process switch creates no activeness for such a browser (`upstream/docshell/base/CanonicalBrowsingContext.cpp:2479-2481`, `BrowsingContext.cpp:822-833`; `nsFrameLoaderOwner.cpp:86-199` copies no render layers; `BrowserParent.cpp:322` starts every new one at render-layers true), stock re-asserts in `DidChangeBrowserRemoteness` (`upstream/browser/components/tabbrowser/content/tabbrowser.js:9037`), and the shell's only listener for that event (`PowerBrowserAPI.sys.mjs:3396`) never does. The fix sets `docShellIsActive` from overlay visibility in that listener; the re-run verdict must flip to `not-reproduced`, and 32-08's `remoteness-regression` must pass with the repro still `not-reproduced`.** Reason: the todo orders reproduce-before-fix with proof; the 27 evidence shows a frameloader swap (same browsing-context id, new childID) with activeness lost. The url half of that evidence (`about:blank`, no GET) is read from the verdict's recorded `url`/`getSeen`/`isolation` fields rather than inferred; if it survives the activeness fix, the executor reports a blocker quoting them instead of weakening the row.

#### Architecture and boundary
- **D-26: Every new kind joins `WEB_TAB_ACTION_KINDS` beside the Phase 27 kinds with one routing line each, extends the `WebTabMessage` union in `web-tab.ts`, and the bridge gate (`verify-web-tab-bridge.mjs`) grows its KIND_CLASSES set-equality derivation in the same commit.** Reason: the Phase 27 pattern plus "derive, do not hand-keep".
- **D-27: Places-backed reads reuse `STORE_REQUEST_KINDS` + `handleStoreRequest` with the shell-window sender wall; tab-host members (favicon / mute / `soundPlaying` / zoom) arrive via the state push, not new store kinds.** Reason: keeps the privileged-kind / network-kind split Phase 29 set.
- **D-28: No stand-in member is added for this phase; if a consumer needs one, its `gBrowser`-receiver branch is grepped and recorded per Pitfall 2 before the plan lands it.** Reason: Pitfall 2 — each member changes every feature-detecting upstream module.
  - *Narrowed 2026-10-23 (cross-phase revision with 31.1):* plan 32-09 alone may add, each recorded in its SUMMARY through its Pitfall-2 grep (every upstream reader in the actor and extension scopes, with the behaviour the addition changes), and none of them a `window.gBrowser` literal member: the host-node method `toggleMuteAudio` (reached by `tabs.update({muted})`, `ext-tabs.js:930-933`); host-node `muted`/`muteReason`/`soundPlaying` kept in sync with `overlay.mute()`/`unmute()` and the `DOMAudioPlayback*` listeners, with `TabAttrModified` `changed: ["muted"]` or `["soundplaying"]`; and the shell shim globals `ZoomManager` (`getZoomForBrowser`, `MIN`, `MAX`), `FullZoom` (`siteSpecific`) and `ZoomUI` (`getGlobalValue`) for `tabs.getZoom` and `tabs.onZoomChange`. `FullZoom` and `ZoomUI` are included because `onZoomChange` cannot deliver without them: its listener awaits `getZoomSettings` (`ext-tabs.js:1378`), which reads `FullZoom.siteSpecific` and `ZoomUI.getGlobalValue()` (`:1286-1295`). Each shim is defined only in `PowerBrowserAPI.sys.mjs`, named on one new `FORBIDDEN_PATTERNS` line with a self-test plant, and compared by `verify-shell-gbrowser-standin.mjs` (Phase 27 policy). Every other plan keeps D-28 as written.
- **D-29: `webTabPush` widens with the new per-tab fields (`securityState` already reserved for Phase 31; favicon, audio/zoom state here) as primitives only — URL, title, three booleans plus small enums — never prefs, tokens or objects.** Reason: the push contract already states primitives-only.

#### Verification
- **D-30: New checks are rows in `scripts/verify-platform.sh` (`--quick` static gates first, live scenarios extend the Phase 27 `pb-live-probe` harness); plans define the live rows but do not run the binary now.** Reason: one driver, one registry; another agent holds the binary.
- **D-31: The find/zoom/mute/download/save/edit/reader/crash kind sets are each checked by deriving the set from the boundary file and comparing with the frontend union as set equality, with `--self-test` plants.** Reason: CLAUDE.md derive-and-compare rule; mirrors the KIND_CLASSES precedent.

### Claude's Discretion
Row markup, chip and panel CSS, codicon choice per tool, downloads-panel list virtualization, find-bar match-count phrasing (from `findbar.ftl` via copy rules), exact plan split and wave order after the research probes. The UI spec fixes visual details; plan-phase research fixes the Finder-listener shape, the `Downloads` view push shape, the readability signal, the crash event, and the F12 stock-DevTools attachment.

**Autonomous-run choice log (standing rule: recommended option + one-line reason):**
- B1 remoteness fix: repair the ready-state/activation ordering chrome-side (keep `docShellIsActive` management + `webTabGeometry` visible discipline, restore activeness after the frameloader swap) rather than disabling `maychangeremoteness` — reason: the attribute is what lets the first https load happen at all (`PowerBrowserAPI.sys.mjs:3245-3252`).
- W2 Task-2 direction: Task 2 wires the bar/chip/marks to the widget methods in the same task (no TODO anchors) — reason: an unwired method is an unproven success criterion at phase end (finding 6).
- PENDING-RELAY rule (checker W1): a not-yet-landed relay row is FAIL from the task that owns the relay rows (the UI task), and out of scope for earlier tasks' gates — reason: one rule removes both the "informational" loophole and the cross-task red.
- New `webTab*` KIND_CLASSES: find/zoom/print/save-pick/save-export/edit/reader/view-source/devtools → `tab-navigation`; mute/downloads-subscribe/downloads-action → `selection` (per-tab content/tool state beside `webTabActivated`); no new store kind, so STORE_KIND_CLASSES is untouched — reason: matches the Phase 27 class meanings (`verify-web-tab-bridge.mjs:51-71`).
- PENDING-RELAY-free gates: each static gate derives arms ↔ union ↔ state/copy only, never relay rows — reason: a gate that names rows a later task owns is the coupling that created W1.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Scope and requirements
- `.planning/ROADMAP.md` Phase 32 — goal, Depends, Requirements, Research, Notes, success criteria 1–5
- `.planning/REQUIREMENTS.md` — PAGE-01..06, PAGE-08..11 (this phase), PAGE-07 (Phase 35), Future rows (per-site zoom memory deferred), Out of Scope rows (no clipboard suggestion, `about:` scheme wall, no Theia core patch)

### Research
- `.planning/research/chrome-bar-firefox-gap.md` — the gap list this milestone measures against (page-tools rows)
- `.planning/research/SUMMARY.md` — how to build it (Phase 4 page-tools section, D6/D7, probes 4/6/9, Open Questions as assigned to this phase)
- `.planning/research/FEATURES.md` §PAGE rows — Firefox behaviour at the pinned tag per tool (find, zoom, print, favicons, mute, downloads, save, edit, reader/source/devtools, crash)
- `.planning/research/ARCHITECTURE.md` — groundwork G1–G11, the wider state push, `AddressBarMode` shape, Anti-Patterns 1–6
- `.planning/research/PITFALLS.md` — Pitfall 2 (stand-in members), Pitfall 3 (silent failure without `browser.xhtml` globals), Pitfall 6 (token cookie), Pitfall 7 (privileged kinds callable from any Theia-origin code), Pitfall 11 (Places writes + clear-history fan-out), Pitfall 13 as applicable
- `.planning/research/STACK.md` — pinned-tag module table: FinderParent via `overlay.finder`, `overlay.fullZoom`, print services + `BrowsingContext.print`, `overlay.mute`, `Downloads.getList`, favicon service, browserDOMWindow shim, keybinding clash table, endpoint allowlist

### Prior phases (builds on)
- `.planning/phases/27-groundwork-navigation-buttons-and-page-focus-keys/27-CONTEXT.md` — push router, action kinds, shortcut relay, live harness, privileged-kind rule
- `.planning/phases/27-groundwork-navigation-buttons-and-page-focus-keys/27-UI-SPEC.md` — overlay layer policy, button contracts, keybinding scope
- `.planning/phases/29-address-bar-search-and-fixup/29-CONTEXT.md` — search fallback, fixup, Places-write-though-boundary-only, `safeIcon`/row pipeline, per-tab drafts
- `.planning/phases/30-address-bar-modes-and-command-centre/30-CONTEXT.md` — pill split, contribution point, Command-centre-never-searches gate, D-50 static binding
- `.planning/phases/28-webextension-tab-route-spike/28-SPIKE-DECISION.md` — signed-off tab-host route, patch 050, D-74 amendment, getTabForBrowser reversal, last-web-tab-stays-active ruling
- `.planning/phases/31-site-identity-and-app-menu/` (assumed — depends) — `openStockPage` enum, widened push (`securityState`), site panel, hamburger menu
- `.planning/phases/31.1-extension-tab-host/` (assumed — depends) — tab host, patch 050, `setIcon`/`getIcon` favicon path, host-node data fields `muted`/`muteReason`/`soundPlaying`, the binary stamp `objdir/.pb-050-build.sha256`

### Boundary and bridge (read before touching)
- `powerbrowser/shell/PowerBrowserAPI.sys.mjs` — `handleWebTabAction` + `WEB_TAB_ACTION_KINDS`, `handleStoreRequest` + `STORE_REQUEST_KINDS`, `webTabPush`, sender walls
- `powerbrowser/INTERNAL-APIS.md` — catalogue discipline (append-only, `--fix` renumbering), privileged-kind rule
- `theia/extensions/tab-uris/src/browser/web-tab.ts` — `WebTabMessage` union, `WebTabState`, `BLOCKING_LAYER_SELECTOR`, channel (`send` vs `request`), `onPush` subscription (no router edits)
- `theia/extensions/chrome-bar/src/browser/chrome-bar-widget.tsx` — bar composition (new tools compose here)
- `theia/extensions/chrome-bar/src/browser/chrome-bar-commands.ts` — command-per-action model, `Browser` category, `currentWebTab()` / navigable-tab predicate
- `theia/extensions/chrome-bar/src/browser/chrome-bar-keybindings.ts` — `ADDRESS_FOCUSED_CONTEXT_KEY`, passthrough pattern, static binding
- `theia/extensions/chrome-bar/src/browser/chrome-bar-shortcuts.ts` — `PAGE_SHORTCUTS` table mirrored in `powerbrowser.js` `PAGE_KEYS`; push-only-the-pushed-tab rule
- `theia/extensions/chrome-bar/src/browser/chrome-bar-copy.ts` — `CHROME_BAR_COPY` + `appSubject()` copy discipline
- `theia/extensions/tab-uris/src/browser/chrome-store-client.ts` — store client pattern for any Places-backed read
- `.planning/milestones/v1.0-phases/01-platform-extraction-and-rename/01-UI-SPEC.md` — no internal identifier in user-facing copy

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `WebTabChannel` (`web-tab.ts`): `send` (fire-and-forget) vs `request` (ack decides UI state); `onPush(kind, handler)` subscription — later phases add kinds by subscribing, never by editing the router; `widgetOf(tabId)` for the push-only-the-pushed-tab rule.
- State push (`PowerBrowserAPI.webTabPush` + `scheduleWebTabState` coalescer): URL/title/loading/`canGoBack`/`canGoForward` read live per animation frame; new per-tab fields ride the same push.
- `WEB_TAB_ACTION_KINDS` + `handleWebTabAction` end-of-file section: new kinds grow downward so catalogued internals lines above never move; unknown-tab answers `{ ok: true, kind, where: "unknown-tab" }`.
- `STORE_REQUEST_KINDS` + `handleStoreRequest` with the shell-window wall (`storeSenderInShellWindow`): template for any Places-backed read (`placesFavicons` precedent).
- Shortcut relay (`chrome-bar-shortcuts.ts` + `PAGE_KEYS` in `powerbrowser.js`): page-scoped `<key>` rows push `{ kind: 'shortcut', id, tabId }`; actions run only against `channel.widgetOf(tabId)`.
- Keybinding scope (`chrome-bar-keybindings.ts`): element-scoped `ADDRESS_FOCUSED_CONTEXT_KEY` + capture-phase passthrough precedent (F6/WR-02) for pill-scoped keys.
- Row pipeline (`address-bar/address-bar-rows.ts`): pure, import-free, Node-testable; `safeIcon`, `iconFor`, `composeRows` — the favicon/type-icon rendering contract.
- Commands (`chrome-bar-commands.ts`): command-per-action with imported const ids, `Browser` category, labelless keybinding-only commands, `currentWebTab()` without importing the widget.
- Live harness (`scripts/lib/pb-live-probe.mjs`, `verify-nav-keys-live.mjs`, `verify-address-bar-live.mjs`): the BiDi pattern live scenarios extend.
- Copy (`chrome-bar-copy.ts`): frozen `CHROME_BAR_COPY` + `appSubject()`; derivation-based copy gates (`verify-shell-error-copy.mjs`).

### Established Patterns
- Overlay layer policy and `BLOCKING_LAYER_SELECTOR` (`web-tab.ts`): dropdown-class layers hide the page; the find bar is the granted shrink-the-page exception.
- Static contribution binding at module load (D-50); privileged kinds only from widget event handlers.
- Derive-from-the-tree-and-compare as set equality + `--self-test` planted faults (bridge kinds, suggestion rows, mode tables, copy derivation).
- `verify-platform.sh` is the only driver; a new check is one registry row (`--quick`, `--only`, full, `--gate`).
- Edits to `powerbrowser/shell/*.js` need `-purgecaches` before a relaunch counts.
- Stage new files before trusting `scan-brand-residue.mjs` (`git ls-files` visibility trap).

### Integration Points
- `powerbrowser/shell/PowerBrowserAPI.sys.mjs` end-of-file web-tab section: all new action kinds land here.
- `powerbrowser/shell/powerbrowser.js` + `powerbrowser.xhtml`: reserved-key rows and any page-scoped `<key>` additions mirror `PAGE_SHORTCUTS`.
- `chrome-bar-frontend-module.ts`: binds new widgets/contributions statically.
- `chrome-bar-widget.tsx`: composes the find bar, zoom chip, downloads button/panel, reader toggle, crash reload affordance.
- `tab-strip-widget.tsx` + address pill: render favicon and audio marks from the pushed fields.
- `scripts/verify-web-tab-bridge.mjs`, `scripts/verify-platform.sh`: grow with every new kind.

</code_context>

<specifics>
## Specific Ideas

- No mockups were reviewed in this `--auto` discussion; the UI spec (`/gsd-ui-phase 32`) carries the visual contract (find-bar placement above the page with the rect shrunk, zoom-chip slot in the pill, downloads button/panel placement, reader toggle, crashed-tab reload) before planning.
- Research probes 4, 6, 9 open the phase: downloads-today, print-today and edit-commands-today live checks, each recorded as a probe verdict before its build plan.

</specifics>

<deferred>
## Deferred Ideas

- PAGE-07 window and page fullscreen — Phase 35 (fullscreen furniture, warning, relayed-prompt origin).
- MENU-03 menu entries and SMODE-07 Actions-mode rows for print / downloads / save / find / zoom — Phase 33 (kinds built here, entries there).
- Tab-menu Mute / Bookmark items — Phase 34.
- Per-site zoom memory; input-history ranking — Future Requirements (explicitly deferred).
- OpenSearch "Add engine" rows; Picture-in-Picture, translations, page-info dialog — Future Requirements.
- Ctrl+P / F1 / Ctrl+Shift+P routing into the pill — Future Requirements (stock quick input keeps them in v1.5). Note 2026-10-23 (N2): page-focus-scoped Ctrl+P printing the page is NOT this row — the row means routing those keys into the pill/quick-input; page-focus Ctrl+P keeps the browser meaning per KEY-04.

</deferred>

---

*Phase: 32-page-tools*
*Context gathered: 2026-10-22*
