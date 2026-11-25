---
status: investigating
trigger: "Investigate issue: G-13-3 — Phase 13 chrome bar: suggestion activation does not navigate, bar above tab strip instead of below per mock order, general functionality wrong."
created: 2026-09-06T00:00:00.000Z
updated: 2026-09-06T00:00:00.000Z
audit_acknowledged:
  milestone: v1.7
  at: 2026-11-25
  status: investigating
---

## Current Focus

hypothesis: Facet 1 — suggestion activation feeds the opaque `webview:<url>` row key into OpenerService, where PowerBrowserWebviewOpenHandler (priority 1000, scheme-gated) claims it and mints a blank panel instead of navigating; raw-text commits parse to `file:` scheme and hit the editor, never the browser. Facet 2 — `shell.addWidget(bar, {area:'top'})` puts the bar in topPanel, structurally above mainPanel's tab strip; no public shell area exists between tab bar and content. Facet 3 — back/forward ride the editor NavigationLocationService (not browser history), reload is hardcoded disabled at both layers, chip has no shell listener so it goes stale.
test: Static source reads only (diagnose-only goal) — Theia 1.74.1 opener-service.js, uri.js/vscode-uri parse probes, view/webview handler canHandle priorities, ApplicationShell.createLayout/addWidget, widget/commands/sources, both verify gates run read-only.
expecting: Each facet resolves to one confirmed root cause with file:line evidence; no code changes.
next_action: Return ROOT CAUSE FOUND (goal is find_root_cause_only; no fix, no human-verify checkpoint).
bug_class: bohrbug
known_pattern_candidate: none — no knowledge base exists yet (.planning/debug/knowledge-base.md absent; MemPalace not queried from this runtime)

## Symptoms

expected: (1) Typing in the address pill suggests up to 8 rows; activating one (Enter or click) navigates the current tab through the existing opener path (OpenerService.getOpener + handler.open). (2) Bar order per the 13-UI-SPEC mock: menubar → tab strip → chrome bar → workarea → status bar. (3) Back/forward/reload/new-tab/mode-toggle/tab-count chip all functional.
actual: User reported verbatim: "well it does not work and is in the wrong locatioin and the functionality is not right. we have alot of fixing to do" — suggestion activation does not navigate; a live screenshot shows the chrome bar rendered ABOVE the editor tab strip (Welcome / Test Sourcer.md tabs below the bar).
errors: None reported (no console output captured)
reproduction: Test 3 in 13-UAT.md, live sidecar with the chrome bar visible
started: Discovered during UAT 2026-09-06; Phase 13 shipped 2026-09-06 with verifications deferred

## Eliminated

- hypothesis: RPC suggestion path broken (proxy/path mismatch, backend not composed)
  evidence: Both modules import CHROME_SUGGESTION_PATH const (no re-spelled literal); backend binds JsonRpcConnectionHandler in singleton scope, frontend binds createProxy in singleton scope; `verify-chrome-bar-suggestions.mjs` PASS live on this tree (prefix/escape/cap-8/recency all hold). The dropdown gets rows; the break is downstream at the opener commit.
  timestamp: 2026-09-06
- hypothesis: Two-step opener form wrong (should be openerService.open())
  evidence: Theia 1.74.1 OpenerService exposes getOpener/getOpeners only — no open method (13-03 deviation 2 proven by tsc red). The free `open()` helper is literally getOpener + handler.open, so the widget's two-step form is faithful. The fault is WHAT uri is fed, not the call shape.
  timestamp: 2026-09-06
- hypothesis: Dropdown commit path broken (blur races click, Enter ignores highlight)
  evidence: Click uses onMouseDown+preventDefault (blur-safe); Enter uses highlighted.uri when highlight>=0 else inputValue; Esc two-stage correct. Path plumbing is sound — the committed value then misroutes at the opener.
  timestamp: 2026-09-06
- hypothesis: Mode toggle maps to wrong perspective ids ('organising' vs 'organizing')
  evidence: mode-descriptors.ts ids are coding/browsing/organising; widget lowercases labels to the same ids; stock switchPerspective applies chromeOptions + onActivate/onDeactivate itself. Shipped-segment mapping is correct; only the ModeService.activateMode side path (custom visibility/panel flags) is bypassed — minor divergence, not the reported break.
  timestamp: 2026-09-06

## Evidence

- timestamp: 2026-09-06
  checked: chrome-bar-widget.tsx commitAddress (lines 179-199) + renderDropdown/Enter/click (211-214, 353-356)
  found: commitAddress does `new URI(text)` on the raw string, then getOpener+handler.open, catching ALL failures into console.error only (no user-visible feedback). Enter commits highlighted.uri else inputValue; click commits row.uri. row.uri is the opaque store key, not the displayed row.url.
  implication: Silent no-op from the user's viewpoint; sets up the scheme-collision and file-scheme findings below.
- timestamp: 2026-09-06
  checked: vscode-uri parse probe of the exact strings commitAddress constructs
  found: 'hello'→scheme file path /hello; 'example.com'→scheme file; 'webview:https://example.com'→scheme webview path 'https://example.com'; 'view:x'→scheme view; 'https://...'→scheme https. vscode-uri defaults schemeless input to `file`.
  implication: Raw-text commits (non-URL per UI-SPEC 194-195) open file-scheme URIs in the editor stack, never browser navigation; the contracted search-or-address mapping has no implementation anywhere.
- timestamp: 2026-09-06
  checked: tabs.sqlite writer (PowerBrowserAPI.sys.mjs browserTabKey line 675-677, parseSessionStoreTabRows 1633-1638, sweep/write paths) + browser-tab-uri.ts browserTabKeyOf
  found: Every browser-tab row key is `webview:` + urlSpec (e.g. `webview:https://example.com/`), deliberately reusing the webview-panel scheme spelling as an opaque store key ("treated as an opaque string and never parsed").
  implication: Suggestion rows carry webview:-scheme keys whose semantics (browser URL) differ from webview-panel addresses (viewType/panelId) sharing the same scheme.
- timestamp: 2026-09-06
  checked: Theia 1.74.1 DefaultOpenerService (opener-service.js) + handler priorities
  found: getOpener rejects `There is no opener for ...` when nothing claims; otherwise highest priority wins. ViewUriOpenHandler claims view/settings at 1000; PowerBrowserWebviewOpenHandler claims webview at 1000; HttpOpenHandler claims http(s)/mailto at 500 and opens an EXTERNAL window via WindowService (never in-tab navigation); editor/file handlers claim file.
  implication: For a suggestion key `webview:https://…`, the webview-panel handler (1000) beats HttpOpenHandler (which sees scheme `webview`, not http, → 0). For typed `https://…`, the http handler opens a new external/stock window, not the current tab. No registered handler navigates the current browser tab in-tab — GUI-02 scope.
- timestamp: 2026-09-06
  checked: PowerBrowserWebviewOpenHandler.open (existing-scheme-coverage.ts 154-177) with a browser-tab key input
  found: parseName('webview:https://example.com/') → 'https://example.com/'; parseWebviewPath splits at first '/' → {viewId:'https:', id:'//example.com/'}, which takes the getOrCreateWidget(WebviewWidget.FACTORY_ID, {viewId:'https:', id:'//…'}) branch — a dedup-key miss against every real panel's {id, viewId}, minting a fresh BLANK webview widget (the documented D-51 carve-out-4 degradation), or throwing for degenerate shapes. Never touches the stock browser tab.
  implication: CONFIRMED mechanism for facet 1: activating a browser-tab suggestion opens a blank Theia webview panel (or throws into the swallowed console.error), never navigates. Scheme collision between opaque row keys and panel addresses.
- timestamp: 2026-09-06
  checked: ApplicationShell.createLayout + addWidget (application-shell.js) + widget contribution line 470 + widget header comment (lines 33-35)
  found: Layout is BoxLayout top-to-bottom [topPanel, sideAreas(mainPanel dock + sides), statusBar]; area 'top' → topPanel.addWidget, explicitly ABOVE the main dock that owns the editor tab strip. Header comment self-documents: "the plain Lumino panel above the main dock". No public area exists between a dock's tab bar and its content — that slot requires dock surgery / custom renderer (ruled out by 13-RESEARCH Pattern 1, locked by 13-01 RED Variant-A "strip stays top").
  implication: CONFIRMED mechanism for facet 2: `shell.addWidget(barWidget, {area:'top'})` structurally cannot satisfy mock order menubar→tab strip→chrome bar→workarea; screenshot (bar above Welcome/Test Sourcer.md tabs) is the layout working as coded. UI-SPEC permits "above or below the Theia toolbar" but the sketch-001 mock order demands below-strip — the as-built pick contradicts the mock and no gate asserts vertical order.
- timestamp: 2026-09-06
  checked: chrome-bar-commands.ts reload (90-94) + widget reload button (391-399)
  found: Command execute is `() => undefined` with isEnabled false; widget button carries hardcoded `disabled={true}`. Double-layer dead control — can never fire by construction; Phase 14/GUI-02 deferral noted in comment.
  implication: Reload broken by design, user-visible as dead button.
- timestamp: 2026-09-06
  checked: Back/forward wiring (commands 77-86, widget 369-390) + NavigationLocationService source (navigation-location-service.js)
  found: Both ride NavigationLocationService (editor cursor/selection location stack, MAX 30, registered as side effect of editor UI events) — not browser session history. In browsing use the stack stays empty so buttons sit permanently disabled.
  implication: Back/forward dead for web content; wrong service for a browser bar.
- timestamp: 2026-09-06
  checked: Widget tab-count (countTabs 235-237, publishTabCount 246-255, call sites 284/331/475; grep for shell listeners)
  found: Count = shell.allTabBars titles sum; published only at onStart, selectMode, syncModeFromPerspective. Zero subscriptions to shell/tab events (no onDidChangeCurrentWidget, tabbar currentChanged, layoutModified). Counts Theia dock tabs only — stock-window tabs invisible. New-tab delegates to OPEN_BROWSER_WINDOW_COMMAND_ID with no URL (window.open('','_blank') → about:blank stock window), per-spec candidate-A but a whole window, not a tab.
  implication: Chip goes stale on every tab open/close until next mode switch; new-tab opens a stock window (spec-correct, user-surprising).
- timestamp: 2026-09-06
  checked: Static gates read-only — verify-chrome-bar-suggestions.mjs + verify-chrome-bar-commands.mjs + registry rows in verify-platform.sh
  found: Both gates PASS on this tree. Suggestions gate asserts search shape + fixture semantics + "mentions OpenerService and .open(" (file-granular, vocabulary-level — any URI fed through any handler passes). Commands gate asserts ids/labels/const-imports. Neither executes an opener call nor asserts DOM order.
  implication: Green gates coexisted with all three facets broken — verification gap, not a safety net. SBFL skipped: no failing unit test exists to spectrum over (logged, not silently passed).

## Resolution

root_cause:
  facet1: "Suggestion activation feeds the opaque store key row.uri (`webview:<url>`, PowerBrowserAPI.browserTabKey) into OpenerService, where the scheme-gated PowerBrowserWebviewOpenHandler (1000) claims it and mints a blank webview panel via a dedup-key miss ({viewId:'https:', id:'//…'}), while raw-text commits parse to `file:` scheme (vscode-uri default) and hit the editor — no registered handler navigates the current browser tab in-tab (HttpOpenHandler at 500 opens an external/stock window); all failures are swallowed into console.error."
  facet2: "Bar is added with `shell.addWidget(barWidget, {area:'top'})` into topPanel, which ApplicationShell.createLayout stacks ABOVE the main dock owning the tab strip — structurally incapable of the mock order menubar→tab strip→chrome bar→workarea; the in-dock slot needs dock surgery ruled out by 13-RESEARCH Pattern 1 / 13-01 RED Variant-A, and no gate asserts vertical order."
  facet3a: "Back/forward ride NavigationLocationService (editor location stack), empty during browsing → permanently disabled for web content."
  facet3b: "Reload is dead by construction: command execute is `() => undefined` with isEnabled false AND widget button disabled={true}."
  facet3c: "Tab-count chip publishes only at startup/mode-switch with no shell/tab listener → stale after any tab open/close; counts Theia dock tabs only."
fix: (diagnose-only — none applied)
verification: (diagnose-only — static reads + read-only gate runs; no live browser run)
files_changed: []
reasoning_checkpoint:
  hypothesis: "Facet 1: opaque webview:-scheme row keys collide with webview-panel addresses at the opener (blank-panel mint). Facet 2: area 'top' stacks above the tab-strip dock by shell construction. Facet 3: editor-nav service + double-disabled reload + listenerless chip."
  confirming_evidence:
    - "vscode-uri probe: schemeless→file, webview:https://…→scheme webview; writer keys every browser row webview:<url>"
    - "Priority table: webview-handler 1000 claims suggestion keys; parseWebviewPath yields {viewId:'https:'} → blank-panel getOrCreateWidget branch"
    - "ApplicationShell.createLayout [topPanel, sideAreas(main), statusBar] + addWidget 'top'→topPanel; header comment 'panel above the main dock'; screenshot bar-above-tabs"
    - "Reload double-disabled lines; NavigationLocationService editor-stack source; zero shell-listener grep hits; both gates PASS read-only"
  falsification_test: "If a live Enter on a browser-tab suggestion navigated the stock tab (or a view: suggestion failed), facet-1 collision would be wrong; if the bar DOM node sat inside mainPanel below the tab bar, facet-2 would be wrong."
  fix_rationale: "N/A diagnose-only — hints recorded for plan-phase --gaps."
  blind_spots: "No live sidecar run (no console capture, no DOM order probe); exact blank-panel-vs-throw split per key shape not executed live; editor file-open behavior for /hello not executed."
  candidate_causes:
    - "code: commitAddress feeds opaque row.uri into opener; reload double-disabled; editor-nav service choice; missing chip listener; area 'top' choice"
    - "data: row keys reuse webview: scheme with panel-incompatible payload (collision only manifests when code feeds keys back into opener)"
    - "config: none (no env/config gating found)"
    - "environment: Theia 1.74.1 shell/opener/URI semantics are the fixed frame the code misuses, not a separate cause"
  and_gate: "no across facets (each facet's single cause fully accounts for its symptom); within facet 1 the code+data pair is ONE mechanism (opaque key × opener parse), not two independent required causes beyond the single collision."
oracle_type: implicit
