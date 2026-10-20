# Pitfalls Research

**Domain:** Firefox-toolbar parity for a Theia-hosted chrome bar driving chrome-owned `<xul:browser>` overlay web tabs in a custom Gecko 153.5.0esr shell window (`powerbrowser.xhtml`, windowtype `powerbrowser:main`, not `browser.xhtml`)
**Milestone:** v1.5 Chrome Bar Firefox Parity
**Researched:** 2026-10-20
**Confidence:** HIGH for pitfalls verified against the pinned `upstream/` source and this tree; MEDIUM where noted (behaviour that needs one live run to confirm); LOW items are labelled.

Phase names used below are the seven v1.5 feature areas in `.planning/PROJECT.md`, plus one groundwork phase that the gap list's "Shared groundwork" section implies must come first:

- **P0 Groundwork**: wider state push, page-focus shortcut relay, web-tab action kinds, popover primitive, Places-write policy, openStockTab allow-list decision, shim policy
- **P1 Address bar modes and search**
- **P2 Navigation buttons and keys**
- **P3 Site identity, permissions and app menu**
- **P4 Page tools and bookmarks**
- **P5 Extensions**
- **P6 Page prompts**

---

## Critical Pitfalls

### Pitfall 1: Giving the shell window an `nsIBrowserDOMWindow` breaks GUI-01 and every Theia `window.open`

**What goes wrong:**
The plan for "target=_blank and window.open open a web tab" (gap list, Page prompts) puts an `nsIBrowserDOMWindow` on the shell window. GUI-01 depends on that object being absent. `powerbrowser.js` (the closing GUI-01 comment block) records the mechanism: with no `nsIBrowserDOMWindow`, `nsWindowWatcher` cannot divert the Theia frontend's `window.open(url, '_blank')` (`theia/extensions/tab-uris/src/browser/browser-window-command.ts`) into a tab, so the call falls through to `AppWindow::CreateNewContentWindow` and opens the stock window. Once a `browserDOMWindow` exists, every `window.open` from the shell's content goes to its `createContentWindow`/`openURI`. That includes the Theia frame's own calls: Open Browser Window, Theia's `WindowService.openNewWindow` for external links, and OAuth/login popups from Theia AI providers. The result is either a new overlay web tab or a cancelled open. Nothing falls through to the old default. CLAUDE.md hard rule 5 calls the reachable stock window "landed"; this change would remove it without any error.

**Why it happens:**
The object is per window, not per browser. The overlay pages and the Theia frame share one chrome window, so the shim cannot apply to one and not the other unless it inspects the opener.

**How to avoid:**
- Build the shim to branch on the opener's top browsing context. If its `embedderElement` is `#powerbrowser-content` (the Theia frame), take the explicit stock-window path: call `PowerBrowserAPI.openBrowserWindow` or `openStockTab` directly. Do not return null from the shim, because a null return cancels the open.
- Move `browser-window-command.ts` off `window.open` and onto an actor request in the same phase. That way GUI-01 no longer depends on the shim being absent.
- Create an overlay opened by a page from the `nsIOpenWindowInfo` that Gecko hands to `createContentWindowInFrame`. tabbrowser passes `openWindowInfo` into the new browser. Without it, `window.opener` is null and opener-dependent flows (OAuth popups, payment popups) break.
- Ownership changes direction here. Today Theia mints the `tabId` and chrome holds `owner: actorRef` (`webTabOpen`, `PowerBrowserAPI.sys.mjs:3231`), and `webTabDropOwnedBy` cleans up on frontend reload. A page-opened tab is created chrome-first and has no owner actor. Define adoption explicitly: chrome mints the overlay, pushes `{kind:'adopt'}`, and the frontend claims it. Without that step the overlay leaks on reload, or it is drawn on top with no placeholder.

**Warning signs:**
Open Browser Window from the palette opens a web tab, or does nothing. The GUI-01 live row goes red. OAuth popups get `window.opener === null`. Overlays survive a frontend reload.

**Phase to address:** P6 (Page prompts). The GUI-01 regression row must be in P6's verification, not deferred.

---

### Pitfall 2: Every member added to the `gBrowser` stand-in changes the code path of every upstream module that feature-detects it

**What goes wrong:**
The stand-in in `powerbrowser.js` has exactly `tabs`, `getTabForBrowser`, `getBrowserForTab` and `setIcon`, and `scripts/verify-shell-gbrowser-standin.mjs` pins it by set equality. Several v1.5 features need more members:

- The PopupNotifications constructor takes the tabbrowser and uses `selectedBrowser` (9 uses), `selectedTab` and `tabContainer` (`upstream/toolkit/modules/PopupNotifications.sys.mjs`; constructed in `upstream/browser/base/content/browser.js:483`).
- Tab-modal prompts use `getTabDialogBox`.
- Favicons need `setIcon` to receive a real tab.

Upstream modules feature-detect these members. `PromptParent.sys.mjs:222` checks `win?.gBrowser?.getTabDialogBox`, then calls `getTabForBrowser`, compares `win.gBrowser.selectedBrowser`, and calls `setTabLabelForAuthPrompts` (lines 232-288). Adding `getTabDialogBox` to support print preview therefore also moves every page `alert()` from the current window-modal fallback onto a code path that calls members the stand-in lacks.

`UPSTREAM_CALL_SITES` in the gate is a hand-kept list of three files (browser-custom-element, LinkHandlerParent, ContextMenuParent). There are 58 upstream files under `browser/actors`, `browser/modules` and the extension parents that touch `gBrowser`, including PromptParent, WebRTCParent, FormValidationParent, RefreshBlockerParent and AboutTabCrashedParent. The gate stays green while a member addition changes their behaviour. That violates verification rule 2 (derive, do not hand-keep).

The extreme version of this mistake is setting `windowtype="navigator:browser"` on the shell so that WebExtensions or PopupNotifications "just work". The extension window tracker accepts only that windowtype (`toolkit/components/extensions/parent/ext-tabs-base.js:1739-1742`). `openStockTab` (`PowerBrowserAPI.sys.mjs:1108`) and `startTabStoreTriggers` enumerate `navigator:browser` windows and would call `addWebTab`/`tabContainer` on the stand-in. SessionStore, BrowserWindowTracker and CustomizableUI would all attach to a window that has no tabbrowser.

**Why it happens:**
Upstream is written against one tabbrowser. Duck typing makes each stand-in member a switch for code you did not read.

**How to avoid:**
- Before adding a stand-in member, grep `upstream/` for every reader of that member on a `gBrowser`/`tabbrowser` receiver and record the branch each one takes, in the plan.
- Make `UPSTREAM_CALL_SITES` derived: every upstream file reachable from an overlay's actors that reads a `gBrowser` member. Keep `--self-test` planting a new caller.
- Never change the shell's windowtype. Treat that as an anti-pattern in ARCHITECTURE.md.
- Prefer intercepting before the upstream consumer, using an own actor, the `disablecontextmenu` attribute, or a pref, over making the stand-in more complete.

**Warning signs:**
New `TypeError ... gBrowser.X is not a function` lines in the launch log (24-GAPS item 2 already shows `LinkHandlerParent.sys.mjs:106,160` "tab is null" and `TranslationsParent.sys.mjs:1574` "tabBrowser is null"). Prompts change modality after an unrelated feature lands.

**Phase to address:** P0 (shim policy and the derived call-site list), enforced again in P3, P4 and P6.

---

### Pitfall 3: Upstream fails silently when the shell lacks a browser.xhtml global, so "it already works" is untested

**What goes wrong:**
Each Firefox feature fails differently in this window, and several fail with no message:

- **Permission requests** (camera, mic, geolocation, notifications) are cancelled. `PermissionUI.sys.mjs:534` and `:617`: `if (!chromeWin.PopupNotifications) { this.cancel(); return; }`. The page sees a denial with no prompt and no log line.
- **alert/confirm/prompt/HTTP auth**: with no `gBrowser.getTabDialogBox`, `PromptParent.sys.mjs:296-307` opens a separate **window-modal** OS dialog (`Services.ww.openWindow(... "centerscreen,chrome,modal,titlebar")`). That dialog blocks the whole shell, including the IDE, rather than one tab.
- **Page context menu**: `ContextMenuParent.sys.mjs:39-41` looks for `win.nsContextMenu`. If it is missing, it takes `docShell.chromeEventHandler` of a top-level chrome window, which is null, and throws on every right-click in an overlay.
- **Favicons**: `LinkHandlerParent.sys.mjs:177,263` resolves a tab and calls `gBrowser.setIcon`. The stand-in returns no tab and `setIcon` is a no-op, so icons are dropped (plus the 24-GAPS FaviconLoader `NS_ERROR_NOT_AVAILABLE`).
- **Clipboard paste popup** (`navigator.clipboard.readText` from a page) creates `#clipboardReadPasteMenuPopup` on demand (`toolkit/modules/ClipboardContextMenu.sys.mjs:173-180`), so it may work. It is unverified.
- **Print** depends on `PrintUtils`, a window-scoped script with `getTabDialogBox` (`toolkit/components/printing/content/printUtils.js:128-137`), which the shell does not load.

**Why it happens:**
Upstream writes "no chrome UI here" as a quiet fallback, because the same actors serve windows (Thunderbird, sidebars) that do not want prompts.

**How to avoid:**
- Begin each prompt or furniture item with a recorded live probe of today's behaviour. The gap list already says "live check first" for dialogs. Record it in the phase RESEARCH so the fix targets the real behaviour.
- Assert on the positive outcome (the prompt is pushed to Theia, a decision arrives, the page's promise resolves). Never assert that an error line is absent, per CLAUDE.md verification rule 1: these fallbacks emit nothing.

**Warning signs:**
A permission feature "works" in a test only because the test site handles denial gracefully. alert() freezes the IDE.

**Phase to address:** P6 for prompts, context menu and permissions. P4 for favicons and print.

---

### Pitfall 4: Reserved keys fire no matter which frame has focus, so the shortcut relay overrides Theia and Monaco

**What goes wrong:**
The existing pattern, `<key reserved="true">` in `powerbrowser.js` (Ctrl+L at the `focusAddressKey` block), is handled in the parent before **any** content process sees the key. That includes the Theia frame, which is also a remote content browser. `GlobalKeyListener::IsReservedKey` (`upstream/dom/events/GlobalKeyListener.cpp:463-500`) has no notion of "only when the page is focused". The current Ctrl+L already shadows Monaco's `expandLineSelection`, which is bound to CtrlCmd+L (`@theia/monaco-editor-core/esm/vs/editor/contrib/lineSelection/browser/lineSelection.js:18`).

Generalising the relay to the gap list's keys with `reserved="true"` breaks these Theia and Monaco bindings in Coding:

| Key | Theia / Monaco owner | Firefox meaning |
|---|---|---|
| F5 | debug start/continue (`debug-frontend-application-contribution.js:677,712`) | reload |
| F6 | debug pause (`:717`) | focus address/page |
| F9 | toggle breakpoint (`:722`) | reader view |
| F11 | step into (`:702`) | fullscreen |
| Ctrl+K and `ctrlcmd+k …` chords | terminal clear (`terminal-frontend-contribution.js:806`), editor chords | search |
| Ctrl+D | add selection to next match (`multicursor.js:586`) | bookmark |
| Ctrl+F | editor/terminal/notebook find | find in page |
| Ctrl+P | quick open (`file-search`) | print |
| Ctrl+Tab | Theia editor switcher (`common-frontend-contribution.js:796`) | next tab |
| Ctrl+J | toggle panel (`:822`) | downloads |

Theia avoids Ctrl+W/T/N in browser builds for this reason: it binds Alt+W to close (`common-frontend-contribution.js:808`).

A second problem applies even with correct key routing. Theia's when-clauses are evaluated against Theia's last focused widget. GUI-DEFECTS item 21 established that an overlay never takes DOM focus inside the Theia document. A relayed Ctrl+K with the page focused can therefore evaluate `terminalFocus` as true from before the click, and clear the terminal.

**Why it happens:**
The one existing example (Ctrl+L) used `reserved` because nothing in Theia conflicted with focusing the address, and that example gets copied.

**How to avoid:**
- Use **non-reserved** chrome `<key>` elements for most relayed shortcuts. A non-reserved key goes to the focused remote browser first. If content does not consume it, a reply event returns to chrome (`IsHandledInRemoteProcess`, `GlobalKeyListener.cpp:465-468`). When the Theia frame is focused, Theia's own keybinding service wins and calls `preventDefault`, so chrome never fires. When the page is focused, the page gets first refusal, as in Firefox.
- In the chrome handler, check which browser was the target (`Services.focus.focusedElement`/the event's original target). Relay only when it is an overlay. Do nothing for the Theia frame.
- Reserve only the keys Firefox itself makes unblockable by pages (Ctrl+T, Ctrl+W, Ctrl+N, Ctrl+Q, Ctrl+Tab, Ctrl+Shift+T and similar). For each one, record the Theia binding it overrides when Theia is focused and the decision taken.
- Have chrome push page focus and blur as a Theia context key (for example `pbWebPageFocus`) and write every relayed binding's when-clause against it. Do not reuse `editorFocus` or `terminalFocus`.
- Derive one shortcut table and check at `--quick` time, as set equality, that the chrome keyset and the Theia keybinding registrations agree.

**Warning signs:**
F5 reloads a web tab while debugging. Ctrl+L stops selecting lines in the editor (already true). Ctrl+K in Browsing clears a terminal you cannot see.

**Phase to address:** P0 (relay design and the reserved/non-reserved decision per key), then P2 (the keys themselves). Ctrl+K belongs to P1, after search fallback.

---

### Pitfall 5: Security indicators computed in Theia from strings show wrong state

**What goes wrong:**
Several separate faults, each of which shows a wrong security state:

1. The current lock comes from the **typed text**: `chrome-bar-widget.tsx:650`, `const secure = this.inputValue.trim().startsWith('https://')`. Typing `https://anything` shows a lock before any navigation.
2. A move to `currentURI` is still wrong. A certificate-error page sits on an `https://` URL. Mixed-content pages, broken TLS and `about:blank` with an inherited principal all have URLs that disagree with their security state.
3. The overlay progress listener registers only `NOTIFY_LOCATION | NOTIFY_STATE_NETWORK` (`PowerBrowserAPI.sys.mjs:3343`), so `onSecurityChange` and `onContentBlockingEvent` never arrive. Adding them creates an ordering problem: the location push lands before the security push. A push that carries the new URL with the old page's state shows the previous site's lock on the next site.
4. "Not Secure" for `http://localhost`/`127.0.0.1` dev URLs: Firefox treats loopback as potentially trustworthy. A URL-derived label is wrong one way or the other. For the Theia frame itself (`http://127.0.0.1:<port>`), any indicator is a bug.
5. IDN: decoding punycode in Theia for display, or showing raw Unicode, bypasses `network.IDN_show_punycode` and the IDN blocklist, which allows homograph spoofing.
6. Page-requested fullscreen (P4 "DOMFullscreen relay, overlay covers the window") without Firefox's fullscreen warning lets a page draw a fake chrome bar and address over the whole window. Pointer lock has the same problem.
7. Relayed alert/auth dialogs styled as product UI with no origin line let a page show text that looks like a PowerBrowser message.

**Why it happens:**
Theia sees URLs. The state lives in `browser.browsingContext.secureBrowserUI`, which exists for any top-level canonical browsing context (`upstream/docshell/base/CanonicalBrowsingContext.cpp:272-280`), so it is available but has to be pushed.

**How to avoid:**
- Compute `securityState` chrome-side from `secureBrowserUI.state` in the same push as `url`, and reset it on every non-same-document location change before the new state arrives.
- Push `displayHost`/`displaySpec` from `nsIIDNService` and never derive them in Theia.
- Never show an identity indicator for non-web widgets (editor tabs use `NavigatableWidget.getUri`, GUI-DEFECTS item 22) or for the Theia frame.
- Ship the fullscreen warning in the same plan as page fullscreen. Every relayed prompt shows the requesting origin from the chrome-side principal.
- Write a check that the identity UI never reads `inputValue`.

**Warning signs:**
The lock appears while typing. The lock stays during a cross-site navigation. A cert-error page shows a lock.

**Phase to address:** P3 for items 1-5 and 7. P4 for item 6. Both pushes come from the P0 state-push widening.

---

### Pitfall 6: The Theia credential cookie is a port-less 127.0.0.1 cookie, and v1.5 adds three ways to delete or expose it

**What goes wrong:**
`setSessionCookie` (`PowerBrowserAPI.sys.mjs:528-560`) stores the token-gate cookie for host `127.0.0.1`: HttpOnly, SameSite=Lax, not Secure. Cookies are not scoped by port. v1.5 interacts with it in three ways:

- **Clear cookies and site data** on a `localhost:4000`/`127.0.0.1:3000` dev tab (`webTabClearSiteData` over SiteDataManager), **Clear recent history** with cookies (Sanitizer), or sanitize-on-shutdown deletes the cookie for the whole host. The Theia backend then returns 403 on the next request or WebSocket reconnect, and the IDE disconnects.
- The localhost/host:port fixup the gap list calls a current bug makes `127.0.0.1:<other port>` web tabs routine. Every such top-level navigation sends the Theia credential to whatever local server listens there (SameSite=Lax permits top-level GET). A compromised dev server then holds a credential for a backend that runs terminals.
- Permission grants, zoom memory and ETP exceptions keyed by origin collect one entry per launch for the Theia frame, because its port is ephemeral (the same reason `localStorage` resets each launch, GUI-DEFECTS "Corrections").

**Why it happens:**
The cookie decision (D-99) was made when nothing could load a second loopback page or clear site data.

**How to avoid:**
- Exempt the token cookie by name from every clear-data and sanitize kind (chrome-side filter, with a check that plants a clear and requires the cookie to survive). Or re-mint it on 403.
- Decide in P1 whether overlay loads to loopback strip the token cookie, for example through a request observer or a separate cookie scope. Record the decision in the threat model.
- The permission and site-settings shim applies only to overlays and never records grants for the Theia frame's origin.

**Warning signs:**
The IDE disconnects after "Clear cookies" on any localhost tab. `permissions.sqlite` grows by one 127.0.0.1 origin per launch.

**Phase to address:** P1 (fixup and exposure decision), P3 (clear site data), P4 (clear history).

---

### Pitfall 7: Each new privileged action kind is callable from anything in the Theia origin, including extensions and AI tools

**What goes wrong:**
The sender wall (`groupSenderIsTheia`, `PowerBrowserAPI.sys.mjs:310-341`) proves that a message came from the shell's Theia frame on the live port. It cannot tell the chrome bar apart from other code in that frame. v1.5 adds kinds that are more powerful than anything currently on the channel:

- `webTabSetPermission` (grant camera to a site)
- `webTabClearSiteData`, Sanitizer
- Places writes (delete history, bookmarks)
- `readClipboardText`
- an `openStockTab` allow-list widened to `about:preferences`, `about:logins`, `about:addons` and `view-source:`

If those actions are also registered as Theia commands, a VS Code extension can run them through `vscode.commands.executeCommand`, and so can the stock Theia AI framework through its command-invoking tools (RM-02 keeps it stock). Example: an extension grants a site camera access with no prompt.

`openStockTab` reaches `openBrowserWindow`, whose window-argument path loads with a **system** triggering principal (`PowerBrowserAPI.sys.mjs` comment above `openStockTab`, citing `browser.js:1304-1310`). Widening its wall with a pattern, rather than a fixed set of literals, is an escalation.

**Why it happens:**
"theia-only, S" items get wired as commands by default, because that is how the palette and keybindings reach them.

**How to avoid:**
- Privileged kinds are invoked only from widget event handlers. Register no command id, or register one that only opens the UI and never performs the change.
- Validate every argument chrome-side. Permission changes require a principal the chrome side derives from the live overlay, never a URL string sent by the frontend.
- The `openStockTab` allow-list is a frozen set of exact literals, and `view-source:` admits only an http(s) inner URL. Add a `--self-test` that plants `about:config`, `chrome:` and `file:`.
- Extend the `gui02-web-tab-bridge` gate's derived kind list to every new kind.

**Warning signs:**
A palette entry such as "Grant permission…" or "Clear history". A command id for a Places write.

**Phase to address:** P0 (rule written once), checked in P3, P4 and P1 (clipboard).

---

### Pitfall 8: Overlays have no z-order. Anything drawn over the page either hides the page or is drawn underneath it

**What goes wrong:**
Overlays are chrome-level `<xul:browser>` elements at `zIndex: 1` above the Theia frame (`webTabOpen`). The only mechanism is to hide every page while any element matching `BLOCKING_LAYER_SELECTOR` is visible (`web-tab.ts:99`: the dropdown, quick-input, dialogOverlay, `.lm-Menu`, drag image). v1.5 adds many layers that must look anchored over the page:

- site-identity and permission panels, the app menu, the bookmark-edit popover, the downloads panel, the history menu
- doorhangers
- the find bar
- hover cards and tooltips
- Theia notification toasts

Each of these needs a decision:

- If the layer is **not** in the list (Theia `.theia-hover` tooltips, notification toasts), it is painted **under** the live page and is invisible wherever it overlaps the page rect.
- If it **is** in the list, the page goes blank while it is open. A permission doorhanger then hides the page that is asking. Hover tooltips blank the page on every mouse-over.
- Focus stays in a hidden overlay. A key relay that opens a Theia menu while the page has focus leaves the arrow keys going to the invisible page, because only `webTabFocusAddress` moves focus back to the frame (`PowerBrowserAPI.sys.mjs:3557`).
- The alternative, XUL `<panel>`s in `powerbrowser.xhtml`, does draw above overlays because panels are native popups. It has two costs. It authors browser chrome markup, which collides with hard rule 5's "no custom browser chrome is authored" and needs a ruling. And BiDi cannot see it (see Pitfall 15).

**How to avoid:**
- Record the layer policy once in P0, with one rule per layer class:
  - (a) Layers anchored in the chrome bar are laid out so they never intersect the page rect, or they hide it.
  - (b) Layers that belong to the page (find bar, notification bars) shrink the placeholder rect through `webTabGeometry` instead of covering it.
  - (c) Transient tooltips never extend over the page rect.
  - (d) A doorhanger is a page-rect-shrinking bar or a panel placed outside the page rect, so the page stays visible.
- Any chrome-initiated opener of a Theia popup first moves focus to the Theia frame, then restores focus to the page on close.
- Add each new popup class to a derived check of the selector list against the popover primitive's class names, so one cannot be added without the other.

**Warning signs:**
The page flickers while the mouse moves over the toolbar. A panel's lower half is missing. The keyboard stops working after Escape.

**Phase to address:** P0 (popover primitive and layer policy), then every UI phase.

---

### Pitfall 9: The Theia command-centre mode in the address bar becomes a second input that hides the page and sends code to the search engine

**What goes wrong:**
- Reusing Theia's quick-input widget for the "Theia command centre" mode (files, `>` commands, `@` symbols) opens `.quick-input-widget`. That is in the blocking selector, so in Browsing the page blanks while you type, and quick-input is centred at the top rather than under the pill.
- Switching between the pill's `<input>` and quick-input's input loses typed text, caret position and IME composition state, and moves focus.
- If engine suggestions (P1) are fed from the same input regardless of mode, workspace file paths, symbol names and command text go to a third-party suggestion endpoint as the user types.
- With command-centre as the Coding default, typing a URL after Ctrl+L in Coding runs a file search.

**How to avoid:**
- Drive Theia's `QuickAccessRegistry` providers into the pill's own dropdown instead of opening the widget, after confirming those providers are reachable without patching Theia core (`diff-theia-core.sh`).
- Engine suggestions and inline autofill run only in web and search modes. Make that a hard rule with a check that command-centre mode never calls the suggestion kind.
- Define the auto-switch rules: a scheme, a dotted host or `localhost:` input leaves command-centre mode. Make the active mode visible in the pill.

**Warning signs:**
Network traffic to the suggestion host while typing in Coding. The page goes blank in Browsing when the dropdown opens.

**Phase to address:** P1.

---

### Pitfall 10: Search changes the endpoint, privacy and rebrand contracts as well as the UI

**What goes wrong:**
- `scripts/verify-endpoints.sh` fails on **any** observed host that is absent from `powerbrowser/endpoint-allowlist.json` (its `$comment`, D-85). Engine suggestion hosts and engine-icon fetches are not listed, so the first live search run turns the endpoint gate red, or the allowlist gets widened by accident.
- `browser.region.network.url` is `""` in the allowlist, so the region is not geolocated. The engine set comes from Remote Settings search-config v2, selected by locale, region and `distroID` (`SearchEngineSelector.sys.mjs:190-224`). The defaults can be Mozilla's partner-coded engines (derivatives ship distribution-specific codes, for example Linux Mint's `client=firefox-b-lm`). A rebranded build that sends Mozilla's codes is a contract question, not a technical one.
- Hard-coding an engine name or URL in Theia code (placeholder text "Search with X", a fallback URL) is a second rebrand file and violates the core value. `configuration.toml` already plans `[urls] default search`.
- Search fallback sends single-word input to the engine. Intranet hosts (`buildbox`, `nas`) leak, and `localhost` does too when the fixup misses it.
- `Services.search` may never have initialised in a session that opened no stock window. Call `await Services.search.init()` inside the API, and never read engines synchronously.
- Hand-written user-facing strings: the chrome bar already hard-codes "PowerBrowser" in copy (`chrome-bar-widget.tsx:610,616`; also `mode-service.ts`, `web-tab.ts`, `save-page-copy-command.ts`), even though `applicationName` exists in the generated app `package.json`. Each new v1.5 message that repeats the literal adds another place a downstream rebrand must edit. The residue scan does not catch it, because it scans originating-product tokens, not this product's name.

**How to avoid:**
- Default engine and engine set come from `configuration.toml` through the generated `policies.json` `SearchEngines` policy (ESR honours Add/Default/Remove; `Policies.sys.mjs:3074`). This is the same mechanism EXT-03 uses.
- Suggestions are off until a decision is recorded. When they are turned on, each engine's suggestion host is an allowlist row with a reason.
- Read the product name from `FrontendApplicationConfigProvider.get().applicationName` in new copy. Decide whether to fix the existing literals or record them as accepted debt.
- Before searching single words, apply the same rule Firefox uses (`browser.fixup.dns_first_for_single_words` / "did you mean to go to").

**Warning signs:**
`verify-endpoints` red after the first live search. A downstream fixture build shows "PowerBrowser" in the search placeholder.

**Phase to address:** P1. The configuration.toml key and generator target belong in P1's first plan.

---

### Pitfall 11: Places writes and "clear history" miss the stores this project added

**What goes wrong:**
Firefox's Sanitizer and `PlacesUtils.history.remove` know about Places, cookies and cache. They do not know about this project's own stores, all of which hold URLs, titles or page images:

- `tabs.sqlite` closed rows (7-day retention, `TAB_STORE_CLOSED_RETENTION_MS`) and Panorama thumbnails (`TAB_STORE_THUMBNAIL_MAX_CHARS`)
- `saved-pages/`
- `powerbrowser-web-tab-history.json` (back/forward lists)
- `powerbrowser-shell-state.json` (the Theia layout, including web tab URLs)
- the backend reader's results

"Clear recent history" that removes Places rows while those stores keep the URLs and screenshots is a privacy defect that looks finished.

Other ways the Places work goes wrong:

- **Raw SQL writes.** The precedent is raw read-only SQL over `promiseDBConnection` (`INTERNAL-APIS.md:36`). A write through raw SQL skips Places triggers, frecency recalculation and `moz_origins` (which autofill depends on) and can corrupt them.
- **Reading `places.sqlite` from the Theia backend for speed.** It hits the same exclusive-lock `SQLITE_BUSY` that GUI-DEFECTS item 18 hit on `tabs.sqlite`.
- **A star that only reads at navigation time.** It goes stale when the bookmark is changed in the stock window or the Library. It needs a Places observer push.
- **Shift+Del applied to rows that come from bookmarks or open tabs.** It deletes the wrong thing. Firefox removes only rows sourced from history.

**How to avoid:**
- One chrome-side `clearHistory` kind fans out to Places, then the `tabs.sqlite` closed rows and thumbnails, `saved-pages`, the web-tab history file, and the URL entries in shell state. Add a check that plants a URL in each store and requires all of them to be gone.
- Places writes go only through `PlacesUtils.bookmarks`/`PlacesUtils.history`. Write this in the re-ruled `INTERNAL-APIS.md:36` row.
- Carry `source` on every suggestion row, and accept Shift+Del only on `history`.

**Warning signs:**
A Panorama card still shows a thumbnail of a site after Clear History. Autofill suggests a deleted origin.

**Phase to address:** P0 (Places-write policy row), P4 (star, clear history), P1 (Shift+Del, input-history ranking).

---

### Pitfall 12: WebExtensions cannot see overlay tabs, so extensions act on the wrong page

**What goes wrong:**
The extension framework's window tracker admits only `windowtype="navigator:browser"` (`ext-tabs-base.js:1739-1742`). Overlay web tabs are therefore not tabs to any extension. The consequences:

- `tabs.query({active:true, currentWindow:true})` from a toolbar button resolves to the active tab of the most recent **stock** window, or to nothing. A password manager, "send page", or translate extension pressed while the user looks at an overlay acts on a different page. That is a data-exposure bug, not a missing feature.
- Content scripts still inject into overlays (injection works per document), but `sender.tab` is undefined. Extensions that route by tab (most password managers, per-site blockers) drop those messages.
- `webRequest` sees overlay requests with `tabId: -1`, which breaks per-tab blocker state.
- `browserAction`/`action` popups are `<browser>` elements inside CustomizableUI panels. With no CustomizableUI area, there is no popup host.
- The add-ons endpoints are `deny` in the allowlist (`services.addons.mozilla.org`, every `extensions.getAddons.*` pref is `""`), so "find more add-ons" links fail the endpoint gate.

The gap list tags this XL with a possible patch, and PROJECT.md lists WebExtensions as an open product decision.

**How to avoid:**
- Run a feasibility spike before roadmap commitment. Today's evidence leans one way: the honest MVP renders action buttons in Theia (icon, title, badge read chrome-side) that open the extension's UI in the stock window against a tab the user chose. The alternative is a patch that registers overlays with `tabTracker`.
- Until that lands, an extension button pressed while an overlay is active must refuse with plain-language copy. It must never act on the stock window's tab without saying so.

**Warning signs:**
An extension's popup shows a URL that is not the visible page.

**Phase to address:** P5. Flag it as needing `/gsd-spike` or deeper research before planning.

---

### Pitfall 13: A clipboard suggestion reads the clipboard with no user gesture

**What goes wrong:**
`readClipboardText` runs chrome-side, so it bypasses the page clipboard permission entirely. If the pill reads the clipboard on every focus to offer a "paste URL" row, then:

- secrets copied from the password manager or a terminal are read on each focus;
- any log line or push that carries the text exposes them;
- if search suggestions are on, the text goes to the engine.

On Wayland, a read while the window is not focused returns stale or empty data, which looks like a flaky bug.

**How to avoid:**
- Read only on explicit Paste & Go, or for the suggestion row only when the clipboard holds a single valid http(s) URL. Return only the parsed URL, never raw text, and never log it.
- Off by default, behind a recorded privacy decision (the gap list already says "needs a privacy decision").

**Phase to address:** P1.

---

### Pitfall 14: ESR fragility moves from patches into shims, and the line-keyed catalogue becomes the merge-conflict point

**What goes wrong:**
- Each shim mirrors an upstream internal contract: the PopupNotifications constructor arguments, PromptParent's duck typing, `win.nsContextMenu.contentData`, LinkHandlerParent's `setIcon` signature, the `nsIBrowserDOMWindow` methods, `PrintUtils`. None of these is a patch, so `apply-patches.sh --self-test` and `check-patch-surface.sh` never see them change across an ESR bump. They fail at runtime in the quiet ways described in Pitfall 3.
- `INTERNAL-APIS.md` rows are keyed by `file:line`. v1.5 adds dozens of touchpoints to a 4,088-line `PowerBrowserAPI.sys.mjs`. Two concurrent plans editing that file shift each other's line numbers, and the catalogue gate goes red after every merge. The project memory notes that other sessions commit to `main`.
- The guard catalogues `gBrowser` occurrences. New shim globals defined in `powerbrowser.js` (`window.PopupNotifications`, `window.nsContextMenu`, `window.browserDOMWindow`) are not in `FORBIDDEN_PATTERNS`. They would turn `powerbrowser.js` into a second boundary without the check noticing, which is exactly what hard rule 2 forbids.
- Splitting the growing API into `PowerBrowserSearch.sys.mjs` and similar files is also a second boundary file.
- Any real patch (extensions, PiP) edited by hand degrades into a silent no-op (CLAUDE.md "Patches are regenerated").

**How to avoid:**
- Add each shim global to `FORBIDDEN_PATTERNS` with a definition-line exemption, as was done for `gBrowser`.
- Give each shim contract a derived `--quick` check over `upstream/`, in the way `verify-shell-gbrowser-standin.mjs` does, so an ESR bump that renames a member goes red by name.
- Run `verify-ng-040-internals-catalogue-lines.mjs --fix` after every merge into the boundary file, and serialise plans that touch it within a wave.
- Any new patch gets its own number (`050-…`) per concern and is regenerated from a patched tree.

**Phase to address:** P0 (guard patterns and the catalogue workflow), P5 (any patch).

---

### Pitfall 15: Static gates and the standalone loop cannot see v1.5 behaviour

**What goes wrong:**
Almost every v1.5 feature crosses the bridge and is decided by DOM geometry, focus or chrome-side UI. None of these can observe that:

- The `--quick` gates read text.
- The standalone sidecar loop (`POWERBROWSER_TOKEN_DISABLE=1` on :4000) has no chrome actor and no overlays, so no push ever arrives.
- BiDi's context tree contains only content browsers. Chrome-context Marionette is platform-blocked (`powerbrowser.js` deck-state comment, WINDOWS #7). XUL panels, doorhangers, the findbar and autocomplete popups are invisible to the harness.
- Headless runs cannot show the GTK print dialog or a real permission decision.
- An edit to `powerbrowser/shell/*.js` does not run unless the startup cache is purged. The F9 live test was invalidated that way.
- Scripted headless passes are evidence, never UAT. Only Chris records a sheet result (PROJECT.md decision).

**How to avoid:**
- Prefer designs whose result is observable in the Theia frame (doorhanger content pushed and rendered by Theia over a shrunk page rect) over chrome XUL panels. That choice decides whether the feature can be verified at all.
- Every live check launches with `-purgecaches` (`MOZ_PURGE_CACHES=1`, remove `startupCache`) and records that it did.
- Assert positive outcomes through the page: the page's `Notification.permission` result, its `confirm()` return value, `document.fullscreenElement`. Do not assert that a log line is absent.
- For print, use the `print.always_print_silent` + `print_to_filename` PDF path.
- Visual geometry uses the KWin + spectacle screenshot procedure.
- Give each new check a `--self-test` that plants a fault.

**Phase to address:** Every phase. P0 should add the shared live harness pieces: page-focus probe, push recorder, purgecaches launcher.

---

## Moderate Pitfalls

- **Zoom breaks overlay geometry.** `webTabGeometry` maps the placeholder rect by identity because "both frames share one window (one devicePixelRatio, no zoom UI)" (`PowerBrowserAPI.sys.mjs` comment above `webTabGeometry`). A zoom key that lands on the Theia frame (Theia binds `ctrlcmd+=/-/0` only in Electron, `electron-menu-contribution.js:305,317`) misplaces every overlay. Site-specific zoom memory is `browser-fullZoom.js` (14 `gBrowser` uses) and does not run here. Whether `browser.fullZoom` survives a cross-process navigation (`maychangeremoteness`) is unverified (LOW); check it live. **Prevention:** zoom only overlays; scale rects if the frame zoom is ever not 1. **Phase:** P4.
- **Print targets the wrong browser.** Ctrl+P in Theia is quick-open. Print must take the overlay's `browsingContext` and the system-dialog path, not `PrintUtils` tab-modal preview (`printUtils.js:128-137` needs `getTabDialogBox`). **Phase:** P4.
- **Audio from hidden tabs.** `docShellIsActive=false` throttles rendering and timers but does not mute media. A hidden overlay can play audio with no indicator. Ship the audible push and mute with or before anything that hides more tabs. **Phase:** P4.
- **Camera or mic granted without an indicator.** Permission prompts that grant WebRTC must ship with the sharing indicator (webrtcUI uses `gBrowser`, `WebRTCParent.sys.mjs:153`). **Phase:** P6, same plan as permission prompts.
- **Prompts from background tabs.** A hidden overlay (another mode, or not the active tab) that requests a permission or calls `alert()` must queue against that tab and show when it becomes visible, naming the tab. It must not interrupt the IDE. **Phase:** P6.
- **The Theia frame's own beforeunload.** Theia sets `beforeunload` for unsaved editors. A prompt relay that renders into the Theia frame cannot serve a prompt from that same frame while it unloads. Apply the relay to overlays only, and leave the Theia frame on the stock window-modal fallback. **Phase:** P6.
- **Prompt spam.** The current fallback is app-modal (Pitfall 3). Any relay needs Firefox's "stop this site prompting" control, or a page loop locks the shell. **Phase:** P6.
- **Downloads with no UI.** Check what an overlay download does today before building the panel (gap list). If it saves silently to `~/Downloads`, that is a drive-by-download exposure to fix first. **Phase:** P4.
- **Context-menu actions run with the wrong principal.** "Open link in new tab" from the forwarded menu must load with the page's principal and referrer, through the http(s) wall. Never use a null or system principal. Set `disablecontextmenu` on the Theia frame so the forward never fires for Theia. **Phase:** P6.
- **Lost hidden-tab state.** Hiding uses `visibility`, never `display:none` or removal, because removal destroys the frameloader and its history (`webTabGeometry` comment). Find bars, notification bars and "unload tab" must keep that invariant, or unload must be explicit. **Phase:** P4.
- **Find-bar layout.** The find bar has to shrink the page rect (gap list), so it must be in Theia's flow layout above the placeholder. Positioned over the placeholder, it is painted under the page. **Phase:** P4.
- **Wrong focus after a Stop/Reload swap.** Swapping the reload button for Stop on the pushed `loading` flag re-renders the button. Keyboard focus on it is lost on every load. Keep one element and change its icon and label. **Phase:** P2.

## Minor Pitfalls

- **Pushes not coalesced.** The progress listener pushes on every state change. Adding security, zoom, favicon and audible fields multiplies the traffic. Coalesce per tab per frame chrome-side, as the frontend already does for geometry (`web-tab.ts` rAF dedupe).
- **IME.** Enter during composition commits half-typed CJK text (gap list item). Guard on `isComposing` in the pill and in quick-access mode switching.
- **Internal names in copy.** New error strings must follow the 01-UI-SPEC rule: no pref keys, kind names or raw exceptions; they name the product and offer a next step. `shell-error-copy-no-internals` checks by pattern, so new chrome-bar copy has to be inside its derived surface.
- **Staging for the brand scan.** `scan-brand-residue.mjs` iterates `git ls-files`. New files must be staged before a green scan counts (CLAUDE.md trap).
- **Tooltip shortcut text.** Shortcut text built from `KeybindingRegistry` will show Theia's binding (for example Alt+W) where the relay handles the Firefox key. Build the text from the same derived shortcut table.

## Technical Debt Patterns

| Shortcut | Immediate Benefit | Long-term Cost | When Acceptable |
|---|---|---|---|
| Add a member to the `gBrowser` stand-in to quiet one upstream consumer | One feature works | Unread upstream branches change behaviour (Pitfall 2) | Only with the per-member reader audit in the plan and the derived call-site list |
| `reserved="true"` for every relayed key | Works from page focus at once | Breaks Theia/Monaco bindings in Coding (Pitfall 4) | Only for Firefox's unblockable set, each with a recorded override decision |
| Security state from the URL string in Theia | No new push field | A wrong lock is a security defect (Pitfall 5) | Never |
| Register privileged actions as Theia commands | Palette and keybindings for free | Extensions and AI tools can grant permissions or wipe data (Pitfall 7) | Never for state-changing kinds; only for "open this panel" |
| Hard-code an engine or product name in copy | Fast copy | A second rebrand file (core value) | Never for new copy; existing literals need a recorded decision |
| Add every popup to `BLOCKING_LAYER_SELECTOR` | No z-order work | Page blanks constantly and the asking page is hidden | Only for full-screen menus and the dragging layer |
| A chrome-side XUL panel for doorhangers | Draws over the page with no layout work | Authors chrome (rule 5 ruling needed), invisible to BiDi | Only with a recorded rule-5 ruling and a screenshot-based check |
| Raw SQL writes to Places | One statement | Skips triggers, frecency and `moz_origins` | Never |

## Integration Gotchas

| Integration | Common Mistake | Correct Approach |
|---|---|---|
| PermissionUI / PopupNotifications | Assume prompts work because no error is logged | They are cancelled silently (`PermissionUI.sys.mjs:534,617`); build the shim, assert the page's result |
| PromptParent | Add `getTabDialogBox` to the stand-in for print | It flips all page prompts onto a path needing `selectedBrowser`/`getTabForBrowser` (`PromptParent.sys.mjs:222-288`) |
| ContextMenuParent | Forward right-clicks after letting the stock actor run | It throws without `win.nsContextMenu` (`ContextMenuParent.sys.mjs:39-41`); intercept first, `disablecontextmenu` on the Theia frame |
| nsIBrowserDOMWindow | Install it for window.open-to-tab | Branch on the opener, and move GUI-01 off `window.open` (Pitfall 1) |
| WebExtensions | Set windowtype `navigator:browser` | Never; spike a Theia-rendered action surface (Pitfall 12) |
| Services.search | Read engines synchronously; hard-code the default | `await init()`; defaults from configuration.toml via `policies.json` `SearchEngines` |
| SiteDataManager / Sanitizer | Clear "127.0.0.1" like any site | Exempt the token cookie (Pitfall 6) |
| Places | Theia backend reads `places.sqlite` directly | Chrome-side kinds only; exclusive locking gives `SQLITE_BUSY` (GUI-DEFECTS 18 precedent) |
| Theia QuickAccess | Open quick-input as the command-centre mode | Drive providers into the pill dropdown; quick-input blanks the page (Pitfall 9) |
| endpoint-allowlist | Add suggestion hosts as an afterthought when the gate goes red | Row per host with reason, decided before enabling |

## Performance Traps

| Trap | Symptoms | Prevention | When It Breaks |
|---|---|---|---|
| Uncoalesced state pushes with the widened field set | Pill and strip lag during heavy pages, actor message backlog | Coalesce per tab per frame chrome-side; send only changed fields | Pages with many redirects or `pushState` loops |
| Suggestion query per keystroke to engine plus Places | Dropdown flicker, request storms | Keep the 150 ms debounce, invalidate in-flight queries on commit (GUI-DEFECTS item 20 pattern) | Fast typists, slow engine endpoints |
| Body MutationObserver re-publishing every web tab for each new popover class | CPU while hovering toolbars | Keep the rAF dedupe; avoid class churn on hover elements | Many open web tabs with frequent tooltips |
| Places observer pushes for bookmark star on every Places notification | Push flood during bookmark import or sync | Filter to the active tab's URL chrome-side | Bulk bookmark operations |
| Find "highlight all" result push per keystroke | Jank on long pages | Debounce find queries; push the final count only | Very large documents |

## Security Mistakes

| Mistake | Risk | Prevention |
|---|---|---|
| Lock or "Not Secure" from URL text | Users trust phishing or cert-error pages | Chrome-side `secureBrowserUI.state`, reset on location change |
| Page fullscreen without the warning | Full-window UI spoofing | Ship the warning with the relay |
| Relayed prompts without origin | Page text passes for product messages | Origin line from the chrome-side principal on every prompt |
| Privileged kinds as Theia commands | Extensions or AI grant permissions or wipe data | Event-handler-only invocation, chrome-side validation |
| `openStockTab` wall widened by pattern | System-principal loads of arbitrary `about:`/`chrome:` | Frozen literal set plus a planted-fault self-test |
| Token cookie sent to other loopback ports | Local dev server gets a backend credential | Decision in P1; strip or scope |
| Clipboard read on focus | Secret exposure | Explicit gesture or URL-only, never logged |
| Extension acts on stock tab while overlay is visible | Data sent from the wrong page | Refuse with copy until overlays are real tabs to extensions |

## UX Pitfalls

| Pitfall | User Impact | Better Approach |
|---|---|---|
| Page blanks whenever any popover opens | Cannot read the page while answering a question about it | Layer policy in P0; shrink rect for page-owned bars |
| Shortcut does different things by invisible focus state | F5 reloads while debugging, Ctrl+K clears terminal | Page-focus context key; non-reserved keys |
| Command-centre default in Coding swallows URLs | Typed URL becomes a file search | Auto-switch on URL-shaped input, visible mode chip |
| alert() freezes the whole IDE | Lost work, force-quit | Tab-scoped relay with the stop-prompting control |
| Permission requests silently denied | Sites "broken" with no explanation | Doorhanger shim, and until then a visible per-tab "blocked" indicator |
| Focus stuck in a hidden page | Keyboard dead after a menu | Move focus to the frame before opening, restore after |

## "Looks Done But Isn't" Checklist

- [ ] **Search fallback:** verify single-word intranet host behaviour, `localhost:4000`, `127.0.0.1:3000` and IPv6 `[::1]:8080` all navigate, and the engine comes from configuration.toml.
- [ ] **Security lock:** verify on a cert-error page, a mixed-content page, mid-navigation cross-site, and while typing.
- [ ] **Shortcuts:** verify each key with the page focused, with Monaco focused, with the terminal focused, and in each mode. F5 still debugs in Coding.
- [ ] **Clear history:** verify `tabs.sqlite` closed rows, thumbnails, `saved-pages`, the web-tab history file and the shell state are cleared, and Theia stays connected.
- [ ] **Clear site data on localhost:** verify the IDE does not disconnect.
- [ ] **window.open to tab:** verify Open Browser Window still opens the stock window (GUI-01) and an OAuth popup keeps `window.opener`.
- [ ] **Permissions:** verify a background tab's request waits, and a camera grant shows a sharing indicator.
- [ ] **Bookmark star:** verify it updates when the bookmark is removed from the stock window's Library.
- [ ] **Extensions:** verify an action pressed with an overlay active never acts on a stock-window tab.
- [ ] **Every chrome-side change:** verify the live run used `-purgecaches`.
- [ ] **New copy:** verify a downstream fixture build shows the downstream name, not "PowerBrowser".

## Recovery Strategies

| Pitfall | Recovery Cost | Recovery Steps |
|---|---|---|
| GUI-01 broken by the browserDOMWindow shim | MEDIUM | Revert the shim; move `browser-window-command.ts` onto an actor kind; re-land with opener branching |
| Stand-in member changed an upstream path | LOW-MEDIUM | Remove the member; intercept upstream consumer instead; add the consumer to the derived call-site list |
| Reserved key broke a Theia binding | LOW | Switch to non-reserved key with target check; add a row to the shortcut table |
| Token cookie cleared in the field | LOW | Re-mint on 403 through TheiaService; add the exemption |
| Catalogue line drift after merge | LOW | `verify-ng-040-internals-catalogue-lines.mjs --fix`, re-run `--catalogue` |
| Extensions built on a fake tabbrowser | HIGH | Remove; fall back to the stock-window route; spike the patch path properly |
| Stale live test (cache not purged) | LOW | Re-run with purge; discard the earlier verdict in the phase log |

## Pitfall-to-Phase Mapping

| Pitfall | Prevention Phase | Verification |
|---|---|---|
| 1 browserDOMWindow vs GUI-01 | P6 | GUI-01 live row green after the shim; opener test page |
| 2 gBrowser stand-in growth | P0 (policy, derived call sites), P3/P4/P6 | `shell-gbrowser-standin` with derived sites and new planted caller |
| 3 Silent upstream fallbacks | P4, P6 | Recorded live probe before each plan; positive page-side assertions |
| 4 Reserved keys and when-clauses | P0, P2 (P1 for Ctrl+K) | Derived shortcut-table set equality; live matrix of focus states |
| 5 Security indicators | P3 (P4 for fullscreen) | Check that identity UI never reads `inputValue`; cert-error and mixed-content live pages |
| 6 Token cookie on 127.0.0.1 | P1, P3, P4 | Planted clear keeps the cookie; IDE survives Clear site data |
| 7 Privileged kinds callable by extensions/AI | P0, P3, P4, P1 | No command ids for state-changing kinds; openStockTab self-test |
| 8 Overlay z-order and focus | P0, every UI phase | Selector vs popover-class derived check; focus probe after menu open |
| 9 Command-centre mode | P1 | No suggestion call in command-centre mode; page visible while dropdown open |
| 10 Search contracts | P1 | `verify-endpoints` green with explicit rows; fixture build engine and name |
| 11 Places and clear history coverage | P0, P1, P4 | Plant-and-clear across every store |
| 12 WebExtensions | P5 (spike first) | Spike verdict recorded before planning |
| 13 Clipboard privacy | P1 | No clipboard read without gesture; no raw text in pushes or logs |
| 14 ESR fragility and catalogue | P0, P5 | New shim globals in `FORBIDDEN_PATTERNS`; derived shim-contract checks |
| 15 Verification blind spots | All, harness in P0 | Purgecaches recorded; positive assertions; self-tests |

## Sources

Tree (HIGH):
- [/home/chris/coding/Power-Browser/powerbrowser/shell/powerbrowser.js](powerbrowser/shell/powerbrowser.js): gBrowser stand-in, reserved Ctrl+L, GUI-01 comment
- [/home/chris/coding/Power-Browser/powerbrowser/shell/powerbrowser.xhtml](powerbrowser/shell/powerbrowser.xhtml): CSP `default-src chrome:`
- [/home/chris/coding/Power-Browser/powerbrowser/shell/PowerBrowserAPI.sys.mjs](powerbrowser/shell/PowerBrowserAPI.sys.mjs): sender wall 244-341, `setSessionCookie` 528-560, `openStockTab` ~1108, `webTabOpen`/`webTabPush`/`webTabGeometry`/`webTabFocusAddress` 3231-3575
- [/home/chris/coding/Power-Browser/powerbrowser/INTERNAL-APIS.md](powerbrowser/INTERNAL-APIS.md): line-keyed rows, Places-read row 36
- [/home/chris/coding/Power-Browser/powerbrowser/endpoint-allowlist.json](powerbrowser/endpoint-allowlist.json): host and pref dispositions
- [/home/chris/coding/Power-Browser/theia/extensions/tab-uris/src/browser/web-tab.ts](theia/extensions/tab-uris/src/browser/web-tab.ts): `BLOCKING_LAYER_SELECTOR` line 99
- [/home/chris/coding/Power-Browser/theia/extensions/chrome-bar/src/browser/chrome-bar-widget.tsx](theia/extensions/chrome-bar/src/browser/chrome-bar-widget.tsx): lock from `inputValue` line 650, literal copy 610/616
- [/home/chris/coding/Power-Browser/scripts/verify-shell-gbrowser-standin.mjs](scripts/verify-shell-gbrowser-standin.mjs): hand-kept `UPSTREAM_CALL_SITES`
- [/home/chris/coding/Power-Browser/.planning/GUI-DEFECTS.md](.planning/GUI-DEFECTS.md): items 17-25, item 10 breakdown
- [/home/chris/coding/Power-Browser/.planning/milestones/v1.4-phases/24-live-uat-pass/24-GAPS.md](.planning/milestones/v1.4-phases/24-live-uat-pass/24-GAPS.md): item 2 launch-log errors, item 10 ignored `moveTo`
- [/home/chris/coding/Power-Browser/.planning/research/chrome-bar-firefox-gap.md](.planning/research/chrome-bar-firefox-gap.md)
- Project memory notes on the chrome JS startup cache, the live GUI debug loop, concurrent sessions on main, and KWin screenshots (outside the workspace, under /home/chris/.claude/projects/-home-chris-coding-Power-Browser/memory/)

Pinned upstream (HIGH, read from `upstream/` at FIREFOX_153_5_0esr_BUILD1):
- `browser/modules/PermissionUI.sys.mjs:465-540,617`; `browser/actors/PromptParent.sys.mjs:200-307`; `browser/actors/ContextMenuParent.sys.mjs:28-46,160-218`; `browser/actors/LinkHandlerParent.sys.mjs:96-263`; `browser/actors/WebRTCParent.sys.mjs:153,1367`
- `toolkit/modules/PopupNotifications.sys.mjs` (tabbrowser members); `browser/base/content/browser.js:483`
- `dom/events/GlobalKeyListener.cpp:360-500` (reserved keys, reply events, editable exemption)
- `docshell/base/CanonicalBrowsingContext.cpp:272-280` (secureBrowserUI on any top BC)
- `toolkit/components/extensions/parent/ext-tabs-base.js:1729-1742`
- `toolkit/components/printing/content/printUtils.js:18,128-137`; `toolkit/modules/ClipboardContextMenu.sys.mjs:173-180`
- `toolkit/components/search/SearchEngineSelector.sys.mjs:190-224`; `browser/components/enterprisepolicies/Policies.sys.mjs:3074`
- Theia 1.76 / Monaco keybindings under `theia/node_modules/@theia/*/lib` (debug, terminal, core, monaco-editor-core lineSelection/multicursor)

Web (MEDIUM/LOW):
- [Linux Mint Firefox branding test case](https://community.linuxmint.com/iso/testcase/43): distribution-specific search partner code (`client=firefox-b-lm`)

---
*Pitfalls research for: v1.5 Chrome Bar Firefox Parity*
*Researched: 2026-10-20*
