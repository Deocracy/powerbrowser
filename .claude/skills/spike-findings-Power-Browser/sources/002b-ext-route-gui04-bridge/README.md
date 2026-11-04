---
spike: 002b
idea: webext-tab-visibility
name: ext-route-gui04-bridge
type: comparison
validates: "Given overlay web tabs mirrored into a real tabbrowser (a hidden navigator:browser window whose tabs proxy the overlays), when an extension queries, listens, injects and clicks, then it sees the page the user sees, with nothing else broken"
verdict: INVALIDATED
related: [spike-001-ext-visibility-today, phase-28-webextension-tab-route-spike, phase-38-webextensions, EXT-04, EXT-05, GUI-04, GUI-05, pitfall-2, pitfall-12]
tags: [webextensions, tabbrowser, mirror-proxy-bridge, hidden-window, getTabForBrowser, live-probe]
---

# Spike 002b: The GUI-04 mirror/proxy bridge as the WebExtension route

## What This Validates

The route under test: keep web tabs as chrome-owned `<xul:browser>` overlays in the shell, and
mirror each one into a real `tabbrowser` that the extension framework already tracks. The
host is a stock `navigator:browser` window opened from the shell and hidden. Each overlay
gets a "twin" tab there. The twin is selected whenever its overlay is the active web tab.

The questions:

1. Does the mirror make extensions see web tabs (`tabs.query`, tab events, active tab,
   `sender.tab`, webRequest/webNavigation tab ids)?
2. What breaks? Two browsers per page? Where do content scripts run? What does a toolbar
   click act on?
3. Is a working version of this the GUI-05 unified tab strip (out of scope for v1.5)?

Verdict: **INVALIDATED.** The mirror does make extensions see tabs, but in every variant tried
they see the wrong document, the wrong active tab, or a tabbrowser in a corrupt state. The
window-level side effects (session restore, link targeting, a phantom window, a button in an
invisible toolbar) apply to every variant. A version that avoids all of this has to rebuild
tabbrowser semantics around the overlays, which is the GUI-05 bridge. Even GUI-05 does not get
past the `windowtype == navigator:browser` gate without a Gecko patch.

## Research

Pinned tree: `upstream/` = `FIREFOX_153_5_0esr_BUILD1`.

What the original bridge design says. The originating product's architecture notes describe
the mirror/proxy pattern as "a chrome-level tab strip owns the unified model": web tabs
`kind: web → backed by a <browser remote="true"> via gBrowser.addTab`, IDE tabs are widgets
in the one Theia `<browser>`, and chrome keeps a push-updated mirror of Theia tab state. GUI-04
in this tree is the negative half of that design: nothing welds Theia to full-window
presentation. Its only artefact is the frozen `TabUriRegistry` surface
(`theia/extensions/tab-uris/src/browser/tab-uri-registry.ts:17-33`, asserted by
`scripts/verify-registry-shape.mjs:50-60`). That surface is `factoryId ↔ URI` for Theia
widgets (`parseName`, `uriOf`, `createWidgetOptions`, `getViewContribution`). It holds no tab
records, ids, selection or events. **GUI-04 gives the extension framework nothing to see.** It
only keeps the Theia side from blocking a later chrome-owned model.

The gates the extension framework applies:

| Gate | Where | Consequence for a mirror |
|---|---|---|
| Browser window = `windowtype == "navigator:browser"` | `toolkit/components/extensions/parent/ext-tabs-base.js:1739-1743`, `:1764-1772` | the tabs must live in a `navigator:browser` window, so a separate hidden one, because the shell must not change windowtype (`.planning/research/PITFALLS.md:465`) |
| `getTabForBrowser(b)` = `b.documentGlobal.gBrowser.getTabForBrowser(b)` | `browser/components/extensions/parent/ext-browser.js:377-389` | for an overlay this asks the **shell's** stand-in (`powerbrowser/shell/powerbrowser.js:84-91`), not the hidden tabbrowser. Linking overlay ↔ twin for inbound events means changing the stand-in |
| `getBrowserData` uses the tab's window when a tab is found | `ext-browser.js:747-770` | a stand-in that returns a twin gives the overlay `{tabId: twin, windowId: hidden}` |
| A tab's page = `nativeTab.linkedBrowser` | `ext-browser.js:806` (`get browser()`), used by executeScript/sendMessage | outbound actions reach the **twin's** browser unless `linkedBrowser` is rewired to the overlay |
| Active tab = `window.gBrowser.selectedTab` | `ext-browser.js:1186-1197`, `:775-781` | the twin must really be selected inside the hidden tabbrowser |
| Lazy tabs, `_insertBrowser` | `browser/components/tabbrowser/content/tabbrowser.js:2944-2978`; private `#tabForBrowser` map `:384, :780, :1196-1198` | selecting a lazy twin inserts and loads its own browser. A rewired twin makes `_insertBrowser` call `getPanel(overlay)`, which resolves to the shell document |

Three variants follow from that table, plus a fourth to get past the throw seen in the third:

| Mode | Twin | Stand-in `getTabForBrowser` | Twin `linkedBrowser` |
|---|---|---|---|
| `eager` | `addTab(url)`, loads the page itself | unchanged (null) | its own browser |
| `lazy` | `addTab(url, {createLazyBrowser:true})` | overlay → twin (runtime patch) | its own lazy browser |
| `rewire` | lazy, then `tab.linkedBrowser = overlay` | overlay → twin | **the overlay** |
| `rewire-panel` | as `rewire`, plus a fake `linkedPanel` so `_insertBrowser` returns early (`tabbrowser.js:2948`) | overlay → twin | the overlay |

## How to Run

```sh
node .planning/spikes/002b-ext-route-gui04-bridge/run.mjs --mode eager          # -> results-eager.json
node .planning/spikes/002b-ext-route-gui04-bridge/run.mjs --mode lazy           # -> results-lazy.json
node .planning/spikes/002b-ext-route-gui04-bridge/run.mjs --mode rewire         # -> results-rewire.json
node .planning/spikes/002b-ext-route-gui04-bridge/run.mjs --mode rewire-panel   # -> results-rewire-panel.json
node .planning/spikes/002b-ext-route-gui04-bridge/summarize.mjs <mode>          # compact per-step view
```

No dev shell is needed. Each run takes about 80 s, headless, on its own fresh profile through
`scripts/lib/pb-relaunch.mjs` (`makeProfile`/`withShell`/`probe`/`pollFor`) and
`scripts/lib/pb-live-probe.mjs` (`openWebTab`/`inChrome`). Neither harness file is modified.
Each run kills only the browser it launched. No product file is edited. The stand-in patch
and the hidden window exist only inside the run's own browser, applied by chrome-scope
evaluate.

Files:
- `extension/`: background and content scripts copied from spike 001, plus ops that address a
  tab by id (`executeScriptTab`, `sendMessageTab`, `activeTab`). The content script reports
  `document.title`.
- `run.mjs`: a local server whose page `/r?<key>` returns a fresh nonce as its title on
  **every** request. Two documents for one tab therefore show different nonces, and the
  server counts loads per key. The mirror lives chrome-side as `window.__m` in the shell. For
  every overlay, each step records the overlay's nonce, its `getBrowserData`, its twin's ext
  tab id, selection, `linkedPanel`, URL and nonce, and the overlay's `docShellIsActive` and
  `renderLayers`. It also records whether the hidden window is `windowTracker.topWindow` and
  `BrowserWindowTracker.getTopWindow()`.
- `summarize.mjs`: prints one results file compactly.

## What to Expect

Each run prints 16 or 17 numbered steps:
1. open the hidden window
2. open overlays A and B, each followed by its twin
3. reach every twin by id
4. activate A, then B, each with the twin selected, and have the extension reach "the active tab"
5. navigate B
6. reach the active tab again
7. `triggerAction` on the hidden window
8. read the session-store and link-target side effects
9. remove twin B, then close overlay B

It then writes `results-<mode>.json` with `steps[]` (action, ground, extension snapshot, load
counts) and `log[]` (every extension event).

## Investigation Trail

1. **Host window.** `Services.ww.openWindow(null, AppConstants.BROWSER_CHROME_URL, …)` from
   the shell gives a stock `navigator:browser` window (`chrome://browser/content/browser.xhtml`,
   stock because patch 020 no longer overrides the define). `nsIBaseWindow.visibility = false`
   threw nothing and read back `true`, because headless has no visibility. Whether the window
   can really be hidden on a desktop was **not** tested. As soon as it exists it is
   `windowTracker.topWindow` and `BrowserWindowTracker.getTopWindow()`, and the extension gets
   `windows.onCreated {type:"normal", focused:false}` plus a `tabs.onCreated` for its
   `about:blank` tab (all modes, step 1).
2. **Eager twins** (results-eager.json). Every page loads twice: `hits {"?a":2,"?b":2}` after
   the twins are added, and `"?b2":2` after a navigation is propagated. With twin A selected,
   `tabs.query({active,currentWindow})` answers id 2 with title `nonce-2`, and
   `executeScript`/`sendMessage` reach `nonce-2`. The user is looking at `nonce-1`.
   Spike 001's wrong-page bug is still there; the wrong page is now a hidden copy of the right
   URL. Content scripts run in **both** documents (`cs-injected` for nonce-1 and nonce-2). The
   overlay's copy still reports `sender.tab: null`, and overlay traffic is still `tabId -1`
   (step 10: `webRequest /r?b2 tabId -1`). A navigation in the overlay does not move the twin
   (step 10: the twin stays at `/r?b`, `nonce-4`) until the mirror reloads it, which costs a
   third document.
3. **Lazy twins + stand-in mapping** (results-lazy.json). Adding a twin costs no load
   (`hits ?a:1`). `tabs.query` lists it with the right URL and the URL as its title, and
   `getBrowserData(overlay)` becomes `{tabId:2, windowId:21}`. But:
   - **Selecting a lazy twin loads it.** Step 6 gives `discarded:false`, a load, and
     `hits ?a:2`, so "active" brings back the double page.
   - Reaching an unselected lazy twin by id fails: `executeScript` gives "An unexpected error
     occurred", and `sendMessage` gives "Receiving end does not exist".
   - Once the stand-in maps overlay → twin, the overlay's own navigation is reported under the
     twin's id (step 10: `webNavigation.onCommitted tabId 3 /r?b2`, `webRequest tabId 3`). Its
     content script gets `sender.tab = {id:3, url:"/r?b"}` with `sender.url = "/r?b2"`, so one
     tab id names two documents with different URLs. After that navigation, `executeScript` on
     the active tab still returns the twin's `nonce-4`, not the overlay's `nonce-5`.
4. **Rewired twins** (results-rewire.json). One document per tab: `hits` stay at 1, the title
   is the overlay's nonce, and `executeScript` by id reaches the overlay (`{"2":["/r?a","nonce-1"]}`).
   Overlay navigation fires `webNavigation`/`webRequest` with the twin id, and `sender.tab` is
   correct. `sendMessage` by id fails ("Receiving end does not exist") for content scripts
   injected before the twin existed; the cause was not traced. **Selection throws**:
   `HierarchyRequestError: Node.appendChild: May not add a Document as a child` at
   `tabbrowser.js:2978`, because `getPanel(overlay)` is `overlay.parentNode.parentNode`, which
   is the shell document. The tabbox marks the twin selected, but
   `gBrowser.selectedTab`/`selectedBrowser` stay on `about:blank`. Results:
   - `queryAll` reports twin 2 `active:true`.
   - `tabs.query({active,currentWindow})` returns `[]`.
   - `triggerAction` fires `onClicked` with **tab 1 `about:blank`** (step 13).
   - **Removing the twin throws** in `_beginRemoveTab` (`nsIWebProgress.removeProgressListener`
     `NS_ERROR_ILLEGAL_VALUE`, `tabbrowser.js:5958`). `tabs.onRemoved {tabId:3}` still fires,
     the tab stays, and the tracker re-ids it as 4. After overlay B closes, a dead tab 3 is
     still listed.
5. **Rewire + fake panel** (results-rewire-panel.json). Selection no longer throws, but
   `selectedTab` still does not change: `{selected:false}`, `selectedBrowser` stays
   `about:blank`, `{active,currentWindow}` returns `[]`, and the click again targets tab 1.
   Removal throws the same way. Getting past this means faking more of `updateCurrentBrowser`
   and the async tab switcher, which the run shows would then drive `docShellIsActive` and
   `renderLayers` on overlays the shell already manages. At that point the work is
   reimplementing tabbrowser.
6. **Side effects common to all four modes** (the "side effects" step):
   - `SessionStore.getBrowserState()` saves the hidden window with its twins
     (`windows:1, tabs:3`).
   - `BrowserWindowTracker.getTopWindow()` and `getMostRecentWindow('navigator:browser')` are
     the hidden window. Every upstream "open in the most recent browser window" path therefore
     lands in an invisible window.
   - The extension's toolbar button is built in the hidden window's nav-bar
     (`buttonInHiddenWindow:true, buttonInShell:false`).

## Results

**Q1. Does a mirror make extensions see web tabs?** Partly, and inconsistently in every mode:

| | eager | lazy + map | rewire (± panel) |
|---|---|---|---|
| `tabs.query({})` lists web tabs | yes (twins) | yes (twins, URL as title until loaded) | yes, with the overlay's URL and title |
| `{active,currentWindow}` = page the user sees | **no**: twin copy (`nonce-2` ≠ `nonce-1`) | **no**: twin copy, loaded on select | **no**: `[]`, because selection fails |
| `executeScript`/`sendMessage` reach the visible page | no: they reach the twin document | no: twin, or an error while lazy | `executeScript` by id yes; `sendMessage` no |
| overlay `sender.tab` / webRequest / webNavigation tab id | null / -1 / dropped | twin id, with the twin's stale URL | twin id, correct |
| `tabs.onCreated/onRemoved` | twin lifecycle | twin lifecycle | onRemoved fires but the tab survives and is re-id'd |
| toolbar click target | twin tab, in an invisible toolbar | twin tab | `about:blank` tab 1 |
| loads per page view | 2 (3 after a propagated nav) | 1, then 2 once selected | 1 |

**Q2. What breaks?**
- **Two browsers per page** (eager, and lazy once selected). Every GET runs twice, so
  one-time tokens, CSRF nonces, analytics, cart and session state diverge. POST results,
  `pushState` and in-page state cannot be mirrored by URL. Extensions act on the copy:
  password fill, dark mode and "send page" all act on a page the user cannot see.
- **Content scripts run in both documents.** The overlay copy has no tab, and the twin copy is
  the one the extension can address.
- **Tab identity splits.** Lazy mapping lets one tab id name two documents, and rewiring
  breaks tabbrowser's invariants. Selection, removal and the private `#tabForBrowser` map all
  assume the browser lives in that tabbrowser's own `tabpanels`.
- **Window-level effects.** These happen in every mode:
  - session restore saves, and on resume restores, a window the user never opened
  - links routed to "the most recent browser window" open invisibly
  - `windows.getAll` shows a phantom `normal` window that never takes focus
  - action buttons, popups, page actions and the extension context-menu entries all live in
    that window's chrome
  - the GUI-01 stock window would then be a second `navigator:browser` window competing for
    "most recent"
- **Stand-in change (Pitfall 2).** The lazy and rewire modes need `gBrowser.getTabForBrowser`
  in the shell to return a real tab. Every upstream actor that feature-detects that receiver
  (LinkHandlerParent, ContextMenuParent, prompt and permission code) would then get a tab
  from a different window. That is the exact change `powerbrowser.js:80-82` rules out, and
  Phase 32's note "getTabForBrowser keeps returning null" depends on it not happening.

**Q3. Is this GUI-05?** A version that works is. The first three modes fail on one point:
tabbrowser owns its browsers and does not proxy browsers that live elsewhere. The two ways out:
- **Move the pages into the tabbrowser.** The tabbrowser then owns the browsers, and the shell
  shows its tabs (the original design's `kind: web → gBrowser.addTab`).
- **Reimplement tabbrowser's selection, removal, progress and panel logic** around the
  overlays.

Either one is the chrome-owned tab model of GUI-05, at XL size. Even then, the extension
framework counts tabs only in `windowtype == navigator:browser` windows
(`ext-tabs-base.js:1739-1743`). So a GUI-05 tabbrowser inside the shell still needs either
the shell's windowtype changed (ruled out, `PITFALLS.md:465`) or a patch to the trackers.
**GUI-05 is necessary for this route and still not enough on its own.**

**Against the requirements** (`.planning/REQUIREMENTS.md:130-135`):
- EXT-05 (tabs API as in Firefox): **not met.** The active tab and outbound actions hit the
  wrong document or fail.
- EXT-06 (toolbar buttons and puzzle menu): **not met.** They exist only in the hidden
  window's chrome, and a Theia-rendered surface is still needed.
- EXT-07 (button opens its popup or acts on the active web tab): **not met.** The click acts
  on the twin or on `about:blank`. Popups anchor in the hidden window (code reading, not run).
- EXT-08 (content scripts, page actions, context menus): content scripts already work today
  (spike 001). This route adds duplicates. Page actions and `menus` entries belong to the
  hidden window's URL bar and `contentAreaContextMenu` (code reading). **Not met.**
- EXT-09 (AMO install with the stock prompt): the install doorhanger is the browser window's
  PopupNotifications, so it would appear in the hidden window (code reading, not run).
  **Not met.**
- EXT-10 (ad blocker, password manager, dark mode live): a password manager and dark mode act
  on the twin, so **not met.** An ad blocker's global filters already apply to overlay
  traffic at `tabId -1` without this route.

**Route statement for Phase 28**
- **Gecko patch:** the experiments ran unpatched. A correct version needs one: either the
  tracker gate, or the GUI-05 model plus the tracker gate.
- **GUI-05:** yes, in effect. A working mirror collapses into the unified tab model.
- **Size:** XL. **Risk:** high (data exposure through acting on the wrong document,
  duplicated side-effecting requests, ESR-fragile tabbrowser internals).
- **Recommendation:** reject this route for v1.5. Ship Tier 1 (a Theia puzzle menu whose
  actions run in the GUI-01 stock window against a tab the user chose, and refuse when an
  overlay is active), and carry Tier 2 with GUI-05 plus a tracker patch, as
  `.planning/research/ARCHITECTURE.md:296-298` recommends.

**Phases this route would change, if adopted** (it is not recommended):
- **29 (search and fixup):** the hidden window becomes `BrowserWindowTracker`'s top window.
  "Open in the most recent browser window" fallbacks, and any search or fixup path that opens
  a tab, would land in it. It would also hide the "SearchService without a stock window"
  question that probe 11 is meant to answer.
- **32 (page tools, favicons through `getTabForBrowser`):** the stand-in must return real twin
  tabs, which reverses the phase's "keeps returning null" note. Favicon, zoom and find code
  that resolves tab → window would reach the hidden window.
- **34 (tab strip, pinned tabs):** twin order, pinning and multiselect must track the Theia
  strip, and extension `tabs.move` and `tabs.update({pinned})` act on the hidden tabbrowser.
  That needs reverse sync, a two-way model, which is GUI-05.
- **35 (shell furniture, context menu):** extension `menus` entries are added to the hidden
  window's `contentAreaContextMenu`, not the shell's stub, so the furniture installer would
  have to copy them over.
- **36 (new-window adoption):** extension `tabs.create` and external links create tabs in the
  hidden window. Each would need adopting back into an overlay, with a frameloader swap.
- **37 (prompts):** permission and password prompts for twin documents fire in the hidden
  window's PopupNotifications. Eager twins also request permissions twice.
- **38 (WebExtensions):** not plannable on this route. Plan Tier 1 instead.
