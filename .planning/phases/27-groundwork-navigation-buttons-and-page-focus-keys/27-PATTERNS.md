# Phase 27: Groundwork, Navigation Buttons and Page-Focus Keys - Pattern Map

**Mapped:** 2026-10-20
**Files analyzed:** 18 (from 27-RESEARCH.md "Recommended Change Map")
**Analogs found:** 17 / 18

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|---|---|---|---|---|
| `powerbrowser/shell/PowerBrowserAPI.sys.mjs` (end-of-file web-tab action section + 1 routing line + `webTabReload` bypassCache) | service (privileged boundary) | request-response | same file, `STORE_REQUEST_KINDS` section :3692-3719 + `handleGroupMutation` arms :2454-2510 | exact |
| `PowerBrowserAPI.sys.mjs` push helper/coalescer (`sendWebTabPush`) | service | event-driven (push) | same file, `webTabPush` :3385-3402 | exact |
| `powerbrowser/shell/powerbrowser.js` (key table, focus tracker, F6 reply listener, AppCommand listener) | config/bootstrap | event-driven | same file, `<keyset>`/`<key>` block :305-333 | exact |
| `powerbrowser/INTERNAL-APIS.md` (+1 row hard-reload `Ci.` flags, append-only header note) | docs/catalogue | n/a | rows :28-141 (e.g. `IOUtils.remove` :140) | exact |
| `theia/extensions/tab-uris/src/browser/web-tab.ts` (union + kinds, `onPush` router, `reload(bypass)`, `webTabActivated`) | service (channel) | request-response + push | same file, `WebTabMessage` :158-167, `WebTabChannel` :204-298, `reload()` :544-558 | exact |
| `theia/extensions/tab-uris/src/browser/profile-storage.ts` (flush listener -> `channel.onPush('flushShellState')`) | service | event-driven | `WebTabChannel.onState` :269-297 | role-match |
| `theia/extensions/chrome-bar/src/browser/chrome-bar-widget.tsx` (Reload/Stop, history menu, Home, hovers, middle-click, drop) | component | request-response | `layout-controls-widget.tsx` :81-89 (menu); existing widget | exact |
| `theia/extensions/chrome-bar/src/browser/chrome-bar-shortcuts.ts` NEW | utility + contribution | event-driven | `chrome-bar-keybindings.ts` (whole file) | role-match |
| `theia/extensions/chrome-bar/src/browser/chrome-bar-preferences.ts` NEW | config | n/a | `theia/extensions/telemetry/src/browser/telemetry-preferences.ts` :19-77 | exact |
| `theia/extensions/chrome-bar/src/browser/chrome-bar-keybindings.ts` (when-clause bindings, if any) | config | n/a | same file + stock `common-frontend-contribution.js:773` | role-match |
| `theia/extensions/chrome-bar/src/browser/tab-strip-widget.tsx` (public switch-order method) | component | n/a | existing `render()` order | exact (self) |
| `theia/extensions/chrome-bar/src/browser/chrome-bar-frontend-module.ts` (static binds) | config (DI) | n/a | same file :71-79 | exact |
| `scripts/verify-web-tab-bridge.mjs` (+ push-kind parity, plants) | test (static gate) | transform | `scripts/verify-chrome-bar-commands.mjs` | exact |
| `scripts/verify-shell-gbrowser-standin.mjs` (derived call sites + DELIBERATELY_ABSENT) | test | transform | `verify-chrome-bar-commands.mjs` (`EXPECTED_*` as the one hand-kept list) | role-match |
| `scripts/check-internals-boundary.sh` (+ shim-global patterns + plants) | test | transform | its own `FORBIDDEN_PATTERNS` / `--self-test` | exact (self) |
| `scripts/verify-shell-error-copy.mjs` (`EXPECTED_WIDGET_COPY` + new surfaces) | test | transform | self | exact (self) |
| `scripts/verify-shortcut-relay.mjs` NEW (+ `--self-test`, quick) | test | transform | `scripts/verify-chrome-bar-commands.mjs` | exact |
| `scripts/lib/pb-live-probe.mjs` NEW | test harness lib | request-response (BiDi) | `scripts/lib/pb-relaunch.mjs` (`withShell`, `probe`, `runCheck`) | exact |
| `scripts/verify-nav-keys-live.mjs` NEW (+ `--self-test`, full only) | test (live) | request-response (BiDi) | `scripts/verify-web-tab-live.mjs` | exact |
| `scripts/verify-platform.sh` (registry rows) | config | n/a | rows :3721-3722 (quick), :4942-4943 (full) | exact |

## Pattern Assignments

### New WebTabChannel kind, end to end

Each new kind (`webTabStop`, `webTabHistory`, `webTabGotoIndex`, `webTabActivated`) touches three places in this order.

**1. Frontend union.** `theia/extensions/tab-uris/src/browser/web-tab.ts` :158-167. Add members here. The doc comment says "The eight kinds", so update the count. The bridge gate derives from this union.
```typescript
/** The eight kinds `handleGroupMutation` serves for web tabs; one stable set for the bridge gate. */
export type WebTabMessage =
    | { kind: 'webTabOpen'; tabId: string; url: string; key: string }
    ...
    | { kind: 'webTabReload'; tabId: string }          // widen: bypassCache?: boolean
    | { kind: 'webTabFocus'; tabId: string };
```
Caller pattern, `reload()` :544-548:
```typescript
const reply = this.settle(await this.channel.request({ kind: 'webTabReload', tabId: this.tabId }));
```
Use `channel.send` for fire-and-forget calls (`webTabActivated`, `webTabStop`), as `webTabFocus` does at :593. Use `channel.request` when the reply decides UI (`webTabHistory`).

**2. Chrome handler.** `powerbrowser/shell/PowerBrowserAPI.sys.mjs`. Do NOT add arms to `handleGroupMutation` (:2454-2510), because that moves catalogued lines. Copy the end-of-file section precedent at :3692-3719:
```javascript
// This section sits at the end of the file on purpose: nothing above the
// last catalogued internals line moves when it grows, so the line references
// in INTERNAL-APIS.md stay valid.
const STORE_REQUEST_KINDS = new Set([ "readHistoryEntry", ... ]);
function isStoreRequestKind(kind) {
  return typeof kind === "string" && STORE_REQUEST_KINDS.has(kind);
}
```
Routing line, copied next to :3679 in `PowerBrowserGroupParent.receiveMessage`:
```javascript
if (isStoreRequestKind(message.data?.kind)) { return handleStoreRequest(message.data, this); }
```
Per-arm validation and reply shape (copy from `webTabReload` :2500-2505):
```javascript
case "webTabReload": {
  if (!webTabIdIsValid(data.tabId)) {
    return { ok: false, reason: "validation", message: "handleGroupMutation: refusing malformed tabId" };
  }
  return { ok: true, kind, where: PowerBrowserAPI.webTabReload(data.tabId) };
}
```
Sender wall: `groupSenderIsTheia(actorRef)` (:310). Tab-id wall: `webTabIdIsValid` (:385-387). Both are module-level, so the end-of-file section can reach them. Resolve the Theia frame from the sender with `actorRef.browsingContext.top.embedderElement` (:2461), never by id. The `PowerBrowserAPI` object is frozen at :389. If `powerbrowser.js` needs new functions, export a second `Object.freeze({...})` from this file (RESEARCH Pattern 1).

**Push helper.** Copy `webTabPush` :3385-3402 (try/catch + `PowerBrowserAPI.log("error", ...)`, primitives only):
```javascript
theiaBrowser.browsingContext.currentWindowGlobal
  .getActor(GROUP_ACTOR_NAME)
  .sendAsyncMessage("PowerBrowserWebTabState", { kind: "state", tabId, url: ..., loading: !!loading, ... });
```
The three call sites (:3324, :3340, :3354) change in place, on the same line, so the line count stays the same.

**Frontend push router.** Copy `WebTabChannel.onState` :269-297 (kind dispatch, `console.error('[@powerbrowser/tab-uris] ...')` in catch). Replace the `if (detail.kind === 'focusAddress')` ladder with `onPush(kind, handler): Disposable` over a `Map<string, Set<handler>>`. Register `state` and `focusAddress` through it, and keep `onDidRequestFocusAddress` (:208-211) as a thin wrapper if callers depend on it.

**3. Catalogue row.** `powerbrowser/INTERNAL-APIS.md`. Copy the row shape at :140 (5 columns, line-keyed):
```
| `IOUtils.remove` | `PowerBrowserAPI.sys.mjs:4066` | `savePageCopy` | Added by non-GUI wave B (NG-028): ... | Removes only the directory this call minted. |
```
The new row is for `Ci.nsIWebNavigation.LOAD_FLAGS_BYPASS_PROXY | ...LOAD_FLAGS_BYPASS_CACHE`. Keep it on one line so it costs one row. Afterwards run `node scripts/verify-ng-040-internals-catalogue-lines.mjs --fix`, then `scripts/check-internals-boundary.sh --catalogue`.

---

### Chrome `<key>` row in `powerbrowser/shell/powerbrowser.js`

**Analog:** the same file, :305-333. Copy this idiom for every key-table row (`createXULElement`, attributes, `command` listener, appended to the one keyset):
```javascript
const focusAddressKey = document.createXULElement("key");
focusAddressKey.setAttribute("id", "powerbrowser-focus-address-key");
focusAddressKey.setAttribute("modifiers", "accel");
focusAddressKey.setAttribute("key", "L");
focusAddressKey.setAttribute("reserved", "true");
focusAddressKey.addEventListener("command", () => {
  PowerBrowserAPI.webTabFocusAddress(browserElement);
});
diagnosticsKeyset.appendChild(focusAddressKey);
document.documentElement.appendChild(diagnosticsKeyset);
```
Changes for this phase:
- Generate the rows from one array literal `{ id, key | keycode, modifiers, reserved, landsInTheia }`.
- Each page row starts with `disabled="true"`. The focus tracker clears `disabled` only while `document.activeElement` is an overlay `<browser>`.
- Ctrl+L stops being always-reserved (CONTEXT decision). The diagnostics chord stays reserved and always enabled.
- Use DOM APIs only. Firefox internals go through `PowerBrowserAPI` (hard rule 2).
- Use `-purgecaches` when testing live (memory: chrome JS startup cache).

---

### Theia keybinding with a when-clause

**Analog:** `theia/extensions/chrome-bar/src/browser/chrome-bar-keybindings.ts` (whole file). No in-tree binding uses `when` yet. Take the clause syntax from stock `@theia/core/lib/browser/common-frontend-contribution.js:773` (`when: '!editorFocus'`).
```typescript
@injectable()
export class ChromeBarKeybindingContribution implements KeybindingContribution {
    registerKeybindings(keybindings: KeybindingRegistry): void {
        keybindings.registerKeybinding({
            command: CHROME_BAR_FOCUS_ADDRESS_COMMAND_ID,   // imported const, never a re-spelled string
            keybinding: 'ctrlcmd+l',
            // when: '<pageFocus context key>'  -- key from ContextKeyService.createKey(key, false)
        });
    }
}
```
Rules: bind against imported `*_COMMAND_ID` consts. `verify-chrome-bar-commands.mjs` fails a re-spelled literal in this file. Use `ctrlcmd`, never literal `cmd+`. Bind statically in the module (D-50). Note that keys enabled while a page has focus never reach Theia keybindings. The when-clause is only for Theia-side meaning (KEY-04).

---

### ContextMenuRenderer menu (history menu)

**Analog:** `theia/extensions/chrome-bar/src/browser/layout-controls-widget.tsx`
Imports :15-20:
```typescript
import { ApplicationShell, ContextMenuRenderer, ReactWidget } from '@theia/core/lib/browser';
import { ..., MenuPath } from '@theia/core/lib/common';
```
Injection :39-40: `@inject(ContextMenuRenderer) protected readonly menus: ContextMenuRenderer;`
Core :81-89:
```typescript
protected openMenu(menuPath: MenuPath, event: React.MouseEvent<HTMLButtonElement>): void {
    const button = event.currentTarget.getBoundingClientRect();
    this.menus.render({
        menuPath,
        includeAnchorArg: false,
        anchor: { x: button.right, y: button.bottom },
        context: event.currentTarget,
    });
}
```
Deltas: anchor at `{ x: rect.left, y: rect.bottom }`. Pass `menu: <dynamic CompoundMenuNode>` with `onHide`. Each child is `{ id, label, sortString, isEnabled, isToggled, run }` (RESEARCH Pattern 5). No command is registered per entry. Read the entries from the `webTabHistory` reply (`browser.browsingContext.sessionHistory`, never `browser.sessionHistory`, Pitfall P1).

---

### Preferences file (NEW `chrome-bar-preferences.ts`)

**Analog:** `theia/extensions/telemetry/src/browser/telemetry-preferences.ts` :19-77. Copy the schema const, the configuration interface, the `Symbol` pair, and `createPreferenceProxy`. Bind at :76-77:
```typescript
bind(TelemetryPreferenceContribution).toConstantValue(contribution);
bind(PreferenceContribution).toService(TelemetryPreferenceContribution);
```
Description copy must not contain a `PowerBrowser` literal (Pitfall P13). Interpolate the application name instead, from `FrontendApplicationConfigProvider.get().applicationName`.

### Frontend module binds

**Analog:** `chrome-bar-frontend-module.ts` :71-79:
```typescript
bind(ChromeBarKeybindingContribution).toSelf().inSingletonScope();
bind(KeybindingContribution).toService(ChromeBarKeybindingContribution);
```
Add the relay and preference binds here, statically.

---

### Derive-and-compare verify script with `--self-test` (NEW `verify-shortcut-relay.mjs`; extensions to `verify-web-tab-bridge.mjs`)

**Analog:** `scripts/verify-chrome-bar-commands.mjs` (224 lines, read whole). Copy the following parts.
- Header doc + `Usage:` lines (:1-24). Imports are Node built-ins only (:26-28). Define `REPO_ROOT`/`NAME`/`*_REL` consts (:30-36).
- One hand-kept `EXPECTED_*` `Object.freeze` list (:43-49), or none at all where both sides derive. Push-kind parity derives both sides with no expectation list.
- `diff(actual, expected)` returning `{surplus, missing}` (:54-61). Regex derivation via `matchAll` (:64-79).
- A pure `checkX(sources)` that returns failure strings. An empty derivation is a failure (:88-91).
- `main()`: FAIL lines plus "edit EXPECTED in the SAME commit", or a PASS line with counts. It returns 0 or 1 and ends with `process.exit(main())` (:147-161, :224).
- `selfTest()` (:163-222): the clean baseline must be green. Each case is `{ name, mutate, expect }` applied to an in-memory source copy. If `mutated === clean`, the case fails (the anchor drifted). Each plant must go red naming `expect`.

For the parity rule, the required plants are a chrome-only kind and a frontend-only kind (RESEARCH Pattern 2).

### `verify-platform.sh` registry rows

Quick (static) rows, analog :3714-3722. Each row has a comment block, then a label|command pair plus its self-test twin:
```sh
    "gui06-chrome-bar-commands|node $REPO_ROOT/scripts/verify-chrome-bar-commands.mjs"
    "gui06-chrome-bar-commands-self-test|node $REPO_ROOT/scripts/verify-chrome-bar-commands.mjs --self-test"
```
Live rows, analog :4928-4943 (full array, indented 6, not `--quick`):
```sh
      "gui02-web-tab-live|node $REPO_ROOT/scripts/verify-web-tab-live.mjs"
      "gui02-web-tab-live-self-test|node $REPO_ROOT/scripts/verify-web-tab-live.mjs --self-test"
```
Append rows only. Never add a sibling driver.

---

### BiDi live script (NEW `verify-nav-keys-live.mjs`, NEW `scripts/lib/pb-live-probe.mjs`)

**Primary analog:** `scripts/verify-web-tab-live.mjs`.
- Imports :106-111: Node built-ins plus `import { withFirefoxPage } from './lib/firefox-bidi.mjs';` only (D-69, no packages).
- Derive from the tree at check time (`derive()` :160, the `*_REL` consts :115-122). Assert the `POWERBROWSER_SHELL_READY` sentinel is PRESENT (:125). Never assert an absence.
- Structure: `runProtocol(derived, plant)` wraps `drive()` and turns a throw into `{driveError}` (:1024-1030). Then `assertReport` (:1331) and `printReport` (:1507), then `main` (:1541). `selfTest` (:1630-1780) runs a clean control plus plants. Scoring is by anchored prefix, a plant that never applied fails, and broken-instrument reports do not score. The script ends with `process.exit(args.includes('--self-test') ? await selfTest() : await main());` (:1782).

**Lighter harness to reuse, not copy:** `scripts/lib/pb-relaunch.mjs`. It provides `withShell(profile, fn)` (:269), which gives `app.evaluate/evaluateIn/send/contexts/chrome`, the chrome context of `powerbrowser.xhtml`. It also provides `probe(app, body)` (:103), `pollFor` (:126), `servePages` (:175), `makeProfile` (:245), and `runCheck(label, body)` (:321), which prints `<label>: PASS/FAIL -- ...`. The new `pb-live-probe.mjs` should extend this file's exports (add a `-purgecaches` launch flag, a push recorder, and a page-focus probe) and should not fork `withShell`. Chrome keys must be dispatched in the chrome context (`evaluateIn(app.chrome, ...)`), not through BiDi content-context key input (Pitfall P11).

## Shared Patterns

- **Reply shape (chrome):** `{ ok: true, kind, where }`, or `{ ok: false, reason: "validation", message: "<fn>: refusing ..." }`. Source: PowerBrowserAPI.sys.mjs :2454-2510. Apply to every new arm.
- **Walls:** `groupSenderIsTheia` (:310), then `webTabIdIsValid` (:385). Apply to every new kind.
- **Error logging:** chrome uses `PowerBrowserAPI.log("error", "[web-tab] ...")` (:3399). The frontend uses `console.error('[@powerbrowser/tab-uris] ...', error)` (web-tab.ts :295).
- **Event dispatch:** `document.dispatchEvent(new CustomEvent(GROUP_REQUEST_EVENT, { bubbles: true, detail }))` (web-tab.ts :258-266). Both `document` and `bubbles` are required.
- **DI:** static binds only (D-50). Use `toSelf().inSingletonScope()` plus `toService`.
- **Gates:** derive and compare as sets, never pass on an empty derivation, and always add a self-test twin row.

## No Analog Found

| File | Role | Data Flow | Reason |
|---|---|---|---|
| F6 reply listener in `powerbrowser.js` (`requestReplyFromRemoteContent`) | event handler | event-driven | Not used anywhere in the tree. Use the upstream `tabbrowser.js:8064-8083` pattern cited in RESEARCH Pattern 4. |
| when-clause keybinding and `ContextKeyService.createKey` | config | n/a | No in-tree use. Use stock Theia (`common-frontend-contribution.js:773`, `context-key-service.d.ts:30`). |
| `HoverService.requestHover` tooltips | component | n/a | No in-tree use. Use RESEARCH Standard Stack. |

## Metadata

**Analog search scope:** powerbrowser/shell, powerbrowser/INTERNAL-APIS.md, theia/extensions/{chrome-bar,tab-uris,telemetry}/src, scripts/, scripts/lib
**Files scanned:** ~14
**Pattern extraction date:** 2026-10-20
