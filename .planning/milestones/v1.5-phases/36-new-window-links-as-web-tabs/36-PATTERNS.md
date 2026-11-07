# Phase 36: New Window Links as Web Tabs - Pattern Map

**Mapped:** 2026-10-22
**Files analyzed:** 14 (from 36-RESEARCH.md "Recommended Change Map")
**Analogs found:** 14 / 14

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|---|---|---|---|---|
| `powerbrowser/shell/PowerBrowserAPI.sys.mjs` (end-of-file adopt section + `installNewWindowReceivers` member on the frozen literal + pending table + 2 routing arms) | service (privileged boundary) | request-response + push | same file, `webTabOpen` :3234-3299 + `STORE_REQUEST_KINDS` end-of-file precedent :3692-3719 | exact |
| `powerbrowser/shell/powerbrowser.js` (one installer call, no assignment of its own) | config/bootstrap | n/a | same file, `window.gBrowser` stand-in :83-99 | exact |
| `powerbrowser/INTERNAL-APIS.md` (append rows: generateQI(nsIBrowserDOMWindow), browserDOMWindow/openLinkIn definition lines, openURIInFrame/createContentWindowInFrame, openWindowInfo, overlay-docshell load) | docs/catalogue | n/a | existing rows :28-141 | exact |
| `theia/extensions/tab-uris/src/browser/web-tab.ts` (`adopt`, `onPush('adoptTab')`, `onPush('dropAdoptedTab')`, `webTabAdopt` ack, union +2) | service (channel) | request-response + push | same file, `openInBackground` :781-789 + `WebTabChannel.request` :287-299 | exact |
| `theia/extensions/tab-uris/src/browser/browser-window-command.ts` (command → openStockTab, drop window.open path) | command | request-response | same file, `requestStockTab` :208-234 + `probeChannel` :130-154 | exact (self) |
| `scripts/verify-new-window-adopt.mjs` NEW (+ `--self-test`, quick) | test (static gate) | transform | `scripts/verify-shortcut-relay.mjs` (Phase 27) | exact |
| `scripts/verify-web-tab-bridge.mjs` (extend: KIND_CLASSES +2 for webTabAdopt + dropAdoptedTab, re-point positive control) | test (static gate) | transform | self | exact (self) |
| `scripts/verify-shell-gbrowser-standin.mjs` (extend: IDL_SHIMS + browserDOMWindow entry with a plant; assumes Phase 35 lands the gate) | test (static gate) | transform | self (35-01 Task 2) | exact (self) |
| `scripts/lib/pb-live-probe.mjs` (reuse `withProbeShell`, push recorder) | test harness lib | request-response (BiDi) | self, Phase 27 plan 27-01 | exact (self) |
| `scripts/verify-new-window-adopt-live.mjs` NEW (+ `--self-test`, full only) | test (live) | request-response (BiDi) | `scripts/verify-nav-keys-live.mjs` | exact |
| `scripts/verify-platform.sh` (append rows only) | config | n/a | rows :3713-3714 (quick), :4896-4897 (gui01) | exact |
| `scripts/check-internals-boundary.sh` (no change; the Phase 27 plants at :364-379 already reject a second `browserDOMWindow`/`openLinkIn` site) | test | transform | self `FORBIDDEN_PATTERNS` | exact (self) |
| `scripts/verify-ng-040-internals-catalogue-lines.mjs` (run `--fix` after boundary edits) | tool | transform | Phase 27 standing rules | exact |
| `powerbrowser/shell/GroupActorChild.sys.mjs` (UNTOUCHED — cited as prohibition) | actor child (content) | event-driven | self | n/a (do not touch) |
| `powerbrowser/shell/powerbrowser.xhtml` (UNTOUCHED — overlay insertion parent) | markup | n/a | self `:58` | n/a (do not touch) |

## Pattern Assignments

### 1. Shim installer behind the boundary (plan 36-01)

`PowerBrowserAPI.sys.mjs` end-of-file section plus ONE delegating member appended to the frozen literal (`:396`) — the Phase 35 lesson: the literal admits no member added from the end of the file. `powerbrowser.js` carries only the installer call — no `browserDOMWindow`/`openLinkIn` spelling outside the boundary file and the gates that name it (checker B1 route (a): installer the shell calls; `FORBIDDEN_PATTERNS` at `check-internals-boundary.sh:83`, plants at `:364-379`).

```javascript
// Boundary file, end-of-file adopt section (append-only) + one literal member:
installNewWindowReceivers(win) {
  const domWindow = {
    QueryInterface: ChromeUtils.generateQI(["nsIBrowserDOMWindow"]),
    // Verbatim IDL signatures (upstream/dom/interfaces/base/nsIBrowserDOMWindow.idl:153-155,186-188):
    // Element createContentWindowInFrame(in nsIURI aURI, in nsIOpenURIInFrameParams params, in short aWhere, in long aFlags, in AString aName)
    // Element openURIInFrame(in nsIURI aURI, in nsIOpenURIInFrameParams params, in short aWhere, in long aFlags, in AString aName)
    // params.openerBrowser / params.openWindowInfo carry the opener + info.
    createContentWindowInFrame(aURI, params, aWhere, aFlags, aName) {
      return PowerBrowserAPI.adoptContentWindow(win, aURI, params, aWhere);
    },
    openURIInFrame(aURI, params, aWhere, aFlags, aName) {
      return PowerBrowserAPI.adoptContentWindow(win, aURI, params, aWhere);
    },
    createContentWindow() { return null; },   // deliberate null: upstream opens a real window
    openURI() { return null; },               // deliberate null: upstream opens a real window
    canClose() { return true; },
    get tabCount() { return 1; },
  };
  win.browserDOMWindow = domWindow;
  // Companion (NOT a QI member — openLinkIn is JS-only, utilityOverlay.js:123 → URILoadingHelper.sys.mjs:465).
  // Stock expects it to LOAD (ClickHandlerParent.sys.mjs:146); the InFrame path must NOT.
  win.openLinkIn = (url, where, params) => PowerBrowserAPI.adoptLinkIn(win, url, where, params);
}
```

```javascript
// powerbrowser.js (one call, beside the gBrowser stand-in): no assignment of its own.
PowerBrowserAPI.installNewWindowReceivers(window);
```

Null fall-through (upstream opens a real window; creates nothing, pushes nothing, writes nothing):
```javascript
if (isTheiaFrameOpener(opener) || where === Ci.nsIBrowserDOMWindow.OPEN_PRINT_BROWSER) {
  return null;
}
```

Opener resolution reuses the `tabIdOfBrowser` family (`PowerBrowserAPI.sys.mjs:4219`): the opener element's entry in `webTabs` gives the opener tabId; a null result plus a Theia-frame embedder check means "Theia opener → null".

### 2. Pending overlay, chrome-first, split load rule (plan 36-01, checker B2)

Clone the attribute half of `webTabOpen` (`:3256-3259` + `messagemanagergroup="browsers"` + `manualactiveness`), `remoteType` copied from the opener element, all attributes set before append (frameloader reads at connect, `browser-custom-element.mjs:397-406`). Then `b.openWindowInfo = openWindowInfo` (the stock idiom at `tabbrowser.js:2801` — the `window.opener` truth), append, attach progress/title listeners with the same QI + strong-hold idiom (`:3313`, `:372-379`). Key `pc-<n>` via a module counter. Scheme wall FIRST (`^https?://` + `about:blank` literal, `:3236` shape) returning `refused-scheme` before any element exists. Split load rule: NO navigation call on the InFrame path (Gecko loads into the returned browser; stock sets `nodefaultsrc`/`skipLoad` at `tabbrowser.js:2835`); `browser.loadURI` WITH the params triggering principal on the `openLinkIn` path (stock contract `URILoadingHelper.sys.mjs:465`; `ClickHandlerParent.sys.mjs:146` expects open + load).

Table swap on ack: `webTabAdopt` arm validates (`webTabIdIsValid` + `pcKey` shape `/^pc-[0-9]+$/` + `groupSenderIsTheia`), moves the entry `pc-* → wt-*`, returns the adopted browser handle outcome; unknown key → `unknown-tab` reply AND a `{kind:'dropAdoptedTab', tabId}` push so the frontend drops the orphan widget (checker W4).

### 3. Adopt push + ack + 5 s fallback (plans 36-01/36-02)

Chrome: `sendWebTabPush(theiaBrowser, { kind: "adoptTab", pcKey, openerTabId, url, background })` — same `sendWebTabPush` helper Phase 27 added, kind spelled literally. Frontend `web-tab.ts`:

```typescript
channel.onPush('adoptTab', detail => this.openHandler.adopt(detail));
channel.onPush('dropAdoptedTab', detail => this.openHandler.dropAdopted(detail.tabId));
async adopt(detail: { pcKey: string; openerTabId: string; url: string; background: boolean }): Promise<WebTabWidget> {
  const opener = this.widgetById(detail.openerTabId);
  const widget = await this.createWidget(detail.url);   // wt-<session>-<n>
  if (opener) { this.shell.addWidget(widget, { area: 'main', ref: opener, mode: 'tab-after' }); }
  else { this.shell.addWidget(widget, { area: 'main', mode: 'tab-after' }); }  // unknown opener: still lands, at end
  if (!detail.background) { await this.shell.activateWidget(widget.id); }
  const reply = await this.channel.request({ kind: 'webTabAdopt', tabId: widget.id, pcKey: detail.pcKey });
  if (!reply.ok && reply.reason === 'unknown-tab') { widget.close(); }  // self-sweep on the reply path too
  return widget;
}
```

Ack reuses `WebTabChannel.request` (5 s `WEB_TAB_ACK_TIMEOUT_MS`). Chrome's fallback on timeout calls its own delayed-startup-safe `openStockTab(url)` — no new window code, the GUI-01 path. The `pc-* → wt-*` swap on the `opened` reply IS the binding: existing geometry/navigate/close paths address the adopted overlay by tabId, so no browser handle crosses the actor boundary. No `webTabActivated` fires on adopt — activation travels the widget path only (one TabSelect per user-visible activation). Close-reselect needs no new code (decided, checker W3): Theia's shell re-activates the previously-active title on close (`application-shell.js:1071-1085`); the live `adopt-order` reselect leg asserts it.

### 4. GUI-01 command move (plan 36-02)

`browser-window-command.ts`: `openBrowserWindow` keeps its probe-off-click-path + `channelAlive` gating, but the popup branch goes away — when the channel is alive the command sends `openStockTab`; when it is not, it throws the existing actionable error (keypress-or-click carries user activation) instead of calling `window.open`. `requestStockTab` keeps its cancelable+bubbles `document.dispatchEvent` shape. The bridge gate's "no stock escape" rule re-points its positive control: the command file is now the ALLOW-listed `openStockTab` sender, every other chrome-bar source still banned from `OPEN_BROWSER_WINDOW_COMMAND_ID` and bare `window.open`.

### 5. Static gate, derive-and-compare (plan 36-01)

New `scripts/verify-new-window-adopt.mjs`, Node built-ins only, `--self-test` staging faults in `mkdtemp` copies (never the tree). Derives at check time: (a) shim QI member set vs pinned IDL `nsIBrowserDOMWindow` member set + call-site member set (`browserDOMWindow`/`openURIInFrame`/`createContentWindowInFrame`/`openLinkIn` spellings across `upstream/`, comments stripped) as set equality; (b) the Theia-frame-opener null path asserts `return null` before any create/append/push/store statement in the null branch (static complement to GUI-01: the positive control is the adopt-path test creating exactly one overlay); (c) single definition site is the boundary guard's own plants (`check-internals-boundary.sh:364-379` reject a second `browserDOMWindow`/`openLinkIn` site — the gate records the guard green, it does not re-derive it); (d) adopt-path overlay attributes vs `webTabOpen` attribute set + `openWindowInfo` assignment present; (e) SPLIT load rule: no `fixupAndLoadURIString`/`loadURI`/`src` navigation in the InFrame section AND a `browser.loadURI` call with the params principal in the `adoptLinkIn` section; (f) `KIND_CLASSES`-compatible classification entries for `adoptTab`/`webTabAdopt`/`dropAdoptedTab`; (g) `pc-` never in store-write calls or user-facing copy sources. Empty derivation on any side fails as a broken instrument.

### 6. Live adopt check (plan 36-03)

New `scripts/verify-new-window-adopt-live.mjs` on `pb-live-probe.mjs` (`withProbeShell`, `MOZ_PURGE_CACHES=1` line, push recorder, `servePages` with a popup page calling `window.open` + a `_blank` link page). Scenarios: `adopt-order` (open two tabs, trigger `_blank` in first, require new tab directly after opener + shell count 1, then close and require the opener reselected), `adopt-opener` (adopted page reads non-null `window.opener`; `postMessage` round-trip to the opener completes), `adopt-popup` (`window.open` with `width/height` features opens a stock popup window, not a tab), `adopt-focus` (middle-click path keeps opener focus; foreground activates), `adopt-fallback` (suppress the ack, wait on the stock-window BiDi context event — never a fixed sleep longer than the 5 s timer — require the URL open and nothing swallowed), `adopt-scheme` (`javascript:` refused), `adopt-unknown-key` (ack for an unknown `pcKey` → `unknown-tab` reply + orphan widget dropped). `--self-test` plants: `adopt-append-at-end`, `reselect-opener-off`, `opener-null`, `popup-becomes-tab`, `background-activates`, `fallback-off`, `adopt-javascript`, `unknown-key-keeps-widget` — each must go red naming the drift; a plant that did not apply fails the self-test. Every absence assertion ships its positive control in the same session recorded by the same recorder (CLAUDE.md rule 1): e.g. the `adopt-fallback` "no second shell" assertion pairs with the `adopt-order` shell-count-1 positive; the `adopt-scheme` "opens nothing" pairs with the `adopt-order` "opens exactly one tab" positive.

## Analog Coverage

Every new/modified file above names its closest analog with line pins. No new package, no new chrome file (a new file under `powerbrowser/shell/` would need a `jar.mn` row + rebuild — none is added), no Theia core edit, no patch edit.
