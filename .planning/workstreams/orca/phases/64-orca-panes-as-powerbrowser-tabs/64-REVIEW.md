---
phase: 64-orca-panes-as-powerbrowser-tabs
reviewed: 2026-11-20T22:39:26Z
depth: deep
files_reviewed: 21
files_reviewed_list:
  - orca-overlay/files/pb-css-scope.mjs
  - orca-overlay/files/src/renderer/src/pb/pb-pane-mount.tsx
  - orca-overlay/files/vite.pb-panes.config.ts
  - orca-overlay/tsconfig.pb-build.json
  - scripts/build-orca-panes.sh
  - theia/extensions/chrome-bar/src/browser/address-bar/address-bar-mode-table.ts
  - theia/extensions/chrome-bar/src/browser/chrome-bar-keybindings.ts
  - theia/extensions/chrome-bar/src/browser/chrome-bar.css
  - theia/extensions/modes/src/browser/mode-descriptors.ts
  - theia/extensions/modes/src/browser/mode-service.ts
  - theia/extensions/orca-panes/package.json
  - theia/extensions/orca-panes/src/browser/orca-pane-bundle.ts
  - theia/extensions/orca-panes/src/browser/orca-pane-observer.ts
  - theia/extensions/orca-panes/src/browser/orca-pane-routes.ts
  - theia/extensions/orca-panes/src/browser/orca-pane-widget.tsx
  - theia/extensions/orca-panes/src/browser/orca-panes-frontend-module.ts
  - theia/extensions/orca-panes/src/common/orca-panes-protocol.ts
  - theia/extensions/orca-panes/src/node/orca-panes-backend-module.ts
  - theia/extensions/orca-panes/tsconfig.json
  - theia/extensions/tab-uris/src/browser/orca-scheme-coverage.ts
  - theia/extensions/tab-uris/src/browser/tab-uri-registry.ts
findings:
  critical: 2
  warning: 5
  info: 6
  total: 13
  necessity: 0
status: issues_found
---

# Phase 64: Code Review Report

**Reviewed:** 2026-11-20T22:39:26Z
**Depth:** deep
**Files Reviewed:** 21
**Status:** issues_found

## Summary

All 21 files in scope were read at HEAD e0c19c54. For the six files that existed before v1.7 (chrome-bar, modes, tab-uri-registry), the review concentrated on the diff from 2b5f4609. Call chains were traced across the boundaries between modules: the pane bundle loader to the backend hand-off and on to OrcaService's bridge-file writes (powerbrowser/shell/OrcaService.sys.mjs:546-571); the observer to planPanes to the widget; the widget close to the bundle's closePane to Orca's store; and the CSS scoping pass to the built sheet (orca/out/web/assets/pb-panes/pb-panes.css).

The verdict on each finding states which owner decision it relied on. D-32 ratifies the always-on tab keys. D-54, D-55, D-56 and D-58 ratify the scoped primary-selection and large-paste hooks. D-57 ratifies focus gating. These are not reported.

Main concerns:
- The CSS scoping pass breaks every Tailwind `dark:` utility in hosted panes. The built sheet confirms it.
- A hosted tab cannot be closed while the bundle is still booting or has failed to boot.
- The bundle boot is never retried, and it can race OrcaService's two bridge-file writes.
- Closing a split-terminal leaf after that leaf is gone falls through to closing the whole terminal tab.

Necessity was assessed (rubric read). No candidate met the evidence rule: the React identity check reads a file loaded across a trust boundary, which the rubric excludes.

## Critical Issues

### CR-01: The CSS scoping pass treats every Tailwind `dark:` utility as a theme root, so no dark-mode utility applies in a hosted pane

**File:** `orca-overlay/files/pb-css-scope.mjs:32,67`
**Issue:** `THEME_RE = /^\.(dark|light)(?![\w-])/` uses the lookahead `(?![\w-])`, which does not exclude the CSS escape backslash. A Tailwind variant class such as `.dark\:border-amber-400\/25` therefore matches as if it were the theme class `.dark`. `scopeSelector` then rewrites it as an ancestor condition, `${head} ${SCOPE}${rest}`. Orca's `@custom-variant dark (&:is(.dark *...))` (orca/src/renderer/src/assets/main.css:32) emits such selectors, and the built sheet now contains, for example:

```
.dark\:border-amber-400\/25:is(.dark :not(...),...) :where([data-pb-orca-pane], body > [data-radix-popper-content-wrapper], body > [data-slot]){
```

This selector requires an element carrying the utility class to be an ancestor of the pane root. Orca's elements are descendants of the pane root, so none of the 173 `dark\:` selectors in orca/out/web/assets/pb-panes/pb-panes.css ever matches. Every hosted terminal, chat and dialog renders its light-mode value for each `dark:` utility in a dark theme (borders, `dark:bg-input/30` fields and so on). The fixtures in scripts/verify-orca-pane-css.mjs:56-57 cover only `.dark .btn` and `:root.dark .x`, so the defect passes them.
**Fix:** Recognise the theme class only as a whole class token. An escaped character such as `\:` or `\/` continues the class name:
```js
const THEME_RE = /^\.(dark|light)(?![\w\\-])/
```
Then add a fixture such as `['dark variant utility', '.dark\\:bg-x:is(.dark *){color:red}', `${S} .dark\\:bg-x:is(.dark *){color:red}, ...`]`. Also check that `isRootOrTheme` (line 50) stops keeping custom properties on these rules.

### CR-02: A hosted Orca tab cannot be closed while the pane bundle is booting or after it failed to boot

**File:** `theia/extensions/orca-panes/src/browser/orca-pane-widget.tsx:159-171`
**Issue:** `onCloseRequest` returns without closing when `bundle.failed` is set (line 165-168). It also routes the close through `bundle.ready()`, and `ready()` does not settle while `waitForPairing` (orca-pane-bundle.ts:102-110) is still polling. That polling has no limit: it runs forever while orcad is down or has not started, and while the hand-off keeps returning `{ refused }`. In either case the Lumino close button does nothing. A widget that Theia's layout restorer recreated therefore stays in the dock, with no way to remove it, for the whole session and every later session while Orca is unavailable. Phase 67's failure page offers no close button (failure/orca-failure-page.tsx has no close affordance). There is a second effect: each click queues a `closePane` that fires all together once the bundle boots later (see WR-02 for why queued leaf closes are harmful). P64-11 requires the close to go through Orca, but only on the assumption that Orca is there to receive it. P64-28 says a restored tab whose Orca tab is gone disposes itself, and this path never reaches that.
**Fix:** When Orca cannot receive the close, close the PowerBrowser tab locally. Only the stored record is involved, because there is no live Orca pane behind it:
```ts
protected override onCloseRequest(_msg: Message): void {
    if (this.tabless || this.bundle.failed || !this.bundle.booted) {
        this.dispose();
        return;
    }
    ...
}
```
To do this, expose a synchronous `booted` flag on OrcaPaneBundle, set when `boot()` resolves. Alternatively, send the close only when `hostingStatus.failureClass` is unset.

## Warnings

### WR-01: The bundle boot can race OrcaService's two bridge-file writes, and a failed boot is never retried

**File:** `theia/extensions/orca-panes/src/node/orca-panes-backend-module.ts:154-199`; `theia/extensions/orca-panes/src/browser/orca-pane-bundle.ts:65-67`
**Issue:** The `OrcaPanesService.handOff` contract (orca-panes-protocol.ts:31) says "undefined until both bridge files are written". `handOff` checks only `web-pairing`. OrcaService writes `web-pairing` first and `orca-panes-dir` second, with an `await PowerBrowserAPI.pathExists` between the two writes (OrcaService.sys.mjs:552-567). A poll that lands between the two writes returns the pairing. `loadEntry` then requests `/orca-panes/pb-panes.js`, and `bundleRootReal()` returns 404 because `orca-panes-dir` is still missing. The boot fails at the `load` step. `ready()` keeps that rejected promise in `this.booting` for the life of the document, so no hosted pane, Orca command or observer works until a reload. The same permanent failure follows any transient error at the `load` or `bootstrap` step, for example orcad restarting between the hand-off and the pairing.
**Fix:** Have `handOff` return undefined until `orca-panes-dir` is also present and private, which is what the contract says. In `ready()`, clear `this.booting` on rejection so that the next `ready()` call, or a timed retry, boots again:
```ts
ready() { return this.booting ??= this.boot().catch(err => { this.booting = undefined; throw err; }); }
```
`failed` stays set for diagnostics.

### WR-02: closePane closes the whole split terminal tab when the requested leaf is already gone

**File:** `orca-overlay/files/src/renderer/src/pb/pb-pane-mount.tsx:994-1006`
**Issue:** The split-leaf path runs only when `leaves.length > 1 && leaves.includes(leaf)`. In every other case the code falls through to `createWorkspaceTabCloseCommands(...).closeItem(tab.id)`, which closes the entire terminal tab with every surviving leaf's shell. A close request whose leaf no longer exists reaches this fall-through in three ways:
- A second close click between Orca removing the leaf and the observer's asynchronous `drain()` disposing the widget.
- Closes queued while the bundle was booting (CR-02).
- A widget that has not yet been dropped after Orca closed the leaf elsewhere.

In a two-leaf tab, `leaves.length` is then 1. A request scoped to one pane must never escalate to closing the whole tab.
**Fix:** When `pick.paneKey` is set, treat a leaf that is no longer present as already closed:
```ts
if (tab.contentType === 'terminal' && pick.paneKey) {
  ...
  if (!leaves.includes(leaf)) return            // stale: that pane is already gone
  if (leaves.length > 1) { ...split close...; return }
}
```

### WR-03: A terminal record's key changes from entityId to a pane key when its layout appears, which disposes and renumbers the tab

**File:** `orca-overlay/files/src/renderer/src/pb/pb-pane-mount.tsx:789-795,831-836`
**Issue:** A terminal tab with no leaves yet is published as `key: tab.entityId, paneKey: null`. As soon as `terminalLayoutsByTabId` gains a leaf, the same pane is republished as `key: makePaneKey(entityId, leaf)`. TerminalPane itself writes the initial layout on mount (orca/src/renderer/src/components/terminal-pane/terminal-pane-mount-preparation.ts:215-218), so this transition can occur for a terminal that is first observed before its layout exists. `planPanes` (orca-pane-routes.ts:186-189) then disposes the first widget as a dropped key and creates a new one. The observer's `markGone` loop (orca-pane-observer.ts:219-224) tombstones the first name, so the new widget is minted under the next free name (for example `term2` instead of `term1`). The React root and any focus that `OrcaPaneCommands.create` gave the first widget are lost.
**Fix:** Give the leaf-less record a key that maps onto the eventual pane key. One option is to omit a terminal record until its layout has a leaf, since the widget shows Orca's waiting state anyway. Another is to have planPanes adopt a known `entityId` key into the first `entityId:<leaf>` key of the same tab instead of disposing it.

### WR-04: subscribePanes runs paneRecords inside Orca's store listener with no guard, so a throw breaks Orca's own setState

**File:** `orca-overlay/files/src/renderer/src/pb/pb-pane-mount.tsx:863-883`
**Issue:** `paneRecords` calls `makePaneKey`, which throws by contract for a tab id containing `:` or a leaf id that is not a UUID (orca/src/shared/stable-pane-id.ts:20-26). It also calls `readStructuredChatTabName` and `resolveUnifiedTabLabel`. The call runs inside `useAppStore.subscribe`, and zustand runs its listeners synchronously inside `setState`. An exception therefore propagates into whichever Orca action changed the store: that store update stops partway, and the listeners after this one are skipped. The observer (orca-pane-observer.ts:131) cannot catch it, because it happens on Orca's side.
**Fix:** Wrap the work in a try/catch, record the failure in `mountErrors`, and keep the previous list:
```ts
let next: OrcaPaneRecord[]
try { next = paneRecords(state) } catch (error) { recordError('observation', 'subscribe')(error); return }
```

### WR-05: build-orca-panes.sh's `eval "$(node ...)" || fail` cannot detect a failed node step

**File:** `scripts/build-orca-panes.sh:72-79`
**Issue:** The exit status of `eval "$(cmd)"` is the status of the evaluated text, not of `cmd`. If the node one-liner fails (a moved `config/scripts/*.mjs` after an Orca re-pin, or a renamed export), the command substitution yields an empty or partial string, `eval ""` returns 0, and `set -e` does not fire. The `fail "could not read Orca's build environment"` branch is unreachable. The build then continues without Orca's rolldown thread limit and old-space option, which is the case that line exists to prevent.
**Fix:**
```bash
build_env="$(node --input-type=module -e '...')" || fail "could not read Orca's build environment (config/scripts)"
eval "$build_env"
```

## Info

### IN-01: The common protocol file imports a type from node/

**File:** `theia/extensions/orca-panes/src/common/orca-panes-protocol.ts:26`
**Issue:** `import type { OfferHandOff } from '../node/offer-file-policy'` makes `common/` depend on `node/`. The import is erased at emit, so nothing breaks at runtime, but it reverses the extension's layering. It is also placed after the export statements, in the middle of the file.
**Fix:** Move `OfferHandOff` and `OfferRefusalReason` into `common/`, and have `node/offer-file-policy.ts` import them from there.

### IN-02: Scoping a selector with a pseudo-class after a pseudo-element produces an invalid selector, so the whole rule is dropped

**File:** `orca-overlay/files/pb-css-scope.mjs:68-72`
**Issue:** The pseudo-element regex matches only when the pseudo-element ends the selector. For `.x::-webkit-scrollbar-thumb:hover`, the "self" form becomes `...::-webkit-scrollbar-thumb:hover:where(body > ...)`, which is invalid. An invalid selector invalidates the whole selector list, including the valid `S X` form. The built sheet has 20 such rules. Gecko ignores `::-webkit-scrollbar*` anyway, so nothing is visible today, but the pass is wrong for any such selector.
**Fix:** Match `(::[\w-]+(?:\([^)]*\))?(?::[\w-]+(?:\([^)]*\))?)*)$` and insert `:where(P)` before the pseudo-element.

### IN-03: The create command waits the full 5 s after a failed create, and can activate an unrelated pane

**File:** `theia/extensions/orca-panes/src/browser/orca-panes-frontend-module.ts:120-130,133-147`
**Issue:** When `createTerminal` or `createChat` throws, `await added` still waits for the 5 s timeout. `nextWidget` also matches any widget of the same kind and worktree, so a pane an agent opens in that window is activated, against P64-10 (an agent opening a pane must not take focus).
**Fix:** Dispose the listener and return in the catch. If the create RPC returns the new tab id, match on it.

### IN-04: mountOnce swallows a mountPane error without logging it and never retries

**File:** `theia/extensions/orca-panes/src/browser/orca-pane-widget.tsx:135-147`
**Issue:** The `.catch` comment says the bundle logged the failure. That is true only for a rejection of `ready()`. A synchronous throw from `api.mountPane` (for example `createRoot` on a host that is already a root) is swallowed with no log line. `mounting` stays true, so the pane stays empty with no record in the log.
**Fix:** Catch `mountPane` separately, log one line naming the kind, and reset `mounting`.

### IN-05: readBridgeFile does not use the no-follow read and inode check that handOff uses

**File:** `theia/extensions/orca-panes/src/node/orca-panes-backend-module.ts:120-131`
**Issue:** `orca-panes-dir` decides which directory's JavaScript is served into the Theia origin. Even so, it is read with `lstatSync` followed by `readFileSync`, which follows a link. The offer file uses `readNoFollow` with a dev/inode match (P67-09). The private bridge folder limits this to the same user, but the two files get different hardening for no stated reason.
**Fix:** Use `readNoFollow` (or a sync equivalent) for `PANES_DIR_FILE` as well.

### IN-06: loadEntry has no timeout

**File:** `theia/extensions/orca-panes/src/browser/orca-pane-bundle.ts:122-147`
**Issue:** If the inline module script never runs (a future CSP on the Theia document, or a script blocked by the shell), neither the boot event nor the failure event fires. `ready()` then hangs at the `load` step and `failed` is never set, so diagnostics show nothing.
**Fix:** Race the promise against a timeout (for example 30 s) that rejects naming the `load` step.

---

_Reviewed: 2026-11-20T22:39:26Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: deep_
