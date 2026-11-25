# Fix brief: G3a-overlay-renderer

Lane: product. Items: 8. Files this group owns: `^orca-overlay/` (pattern).

Item IDs: overlay-renderer-02 = 64-CR-01; overlay-renderer-01; 64-WR-02; 64-WR-03; 64-WR-04; 65-WR-01; overlay-renderer-03; overlay-renderer-04.

## overlay-renderer-02 = 64-CR-01: CSS scoping pass treats every Tailwind dark: utility as a theme root, so dark-mode utilities never apply in hosted panes

- **Severity:** medium
- **Verdict:** CONFIRMED
- **Location:** `orca-overlay/files/pb-css-scope.mjs:32`

**What is wrong.** THEME_RE is /^\.(dark|light)(?![\w-])/. In an escaped Tailwind class such as `.dark\:bg-input\/30`, the character after `.dark` is a backslash, which is not in [\w-], so the regex matches. scopeSelector then rewrites the selector as `<whole compound> S`, which selects a pane or portal root that is a descendant of an element carrying the utility class. That never matches, so the utility's declarations are lost. Any custom-property declarations in the same rule are kept on the unscoped original selector. The built pb-panes.css at this commit has about 96 distinct `.dark\:` utilities rewritten this way, for example dark:bg-input/30 on inputs, dark:invert, dark:ring-accent and dark:bg-accent. No Theia or PowerBrowser chrome is restyled, so this is not a scope escape. It is a visible styling defect in dark mode.

**Scenario.** Orca is in dark mode and a hosted Orca Settings page or dialog renders a shadcn Input with `dark:bg-input/30`. The built rule is `.dark\:bg-input\/30:is(.dark :not(...),...) :where([data-pb-orca-pane], body > [data-radix-popper-content-wrapper], body > [data-slot]){background-color:var(--input)}`. It does not match the input, so the input has no dark background. Icons that rely on `dark:invert` show dark-on-dark.

**Preconditions.** Orca's dark theme is active in a hosted pane or portal.

**Evidence.** pb-css-scope.mjs:32: const THEME_RE = /^\.(dark|light)(?![\w-])/
pb-css-scope.mjs:67: if (THEME_RE.test(head)) return [`${head} ${SCOPE}${rest}`.trim()]
Built orca/out/web/assets/pb-panes/pb-panes.css contains:
.dark\:invert:is(.dark :not(...),...) :where([data-pb-orca-pane], ...){filter:var(--tw-blur,) ... var(--tw-invert,) ...}
.dark\:bg-input\/30:is(...) :where([data-pb-orca-pane], ...){background-color:var(--input)}

**Suggested fix.** Exclude an escaped character from the theme match, for example /^\.(dark|light)(?![\w\\-])/, so that `.dark\:x` falls through to the generic `S X, X:where(P)` branch. Add a fixture to orca-pane-css with a `.dark\:bg-x:is(.dark *)` rule that requires the scoped descendant form.

**Verifier (CONFIRMED, medium).** pb-css-scope.mjs:32 THEME_RE /^\.(dark|light)(?![\w-])/ matches the escaped class `.dark\:...` because the character after `.dark` is a backslash. firstCompound treats the space inside `:is(.dark *)` as depth 1, so head is the whole compound. Line 67 then emits `<head> :where(scope roots)`, which only matches a scope root that is a descendant of the element carrying the utility. The built orca/out/web/assets/pb-panes/pb-panes.css contains exactly that: `.dark\:bg-input\/30:is(.dark ...) :where([data-pb-orca-pane], ...){background-color:...}`. It has 125 distinct `.dark\:` rule heads and no correctly scoped `:where(...) .dark\:` form. In the dark:invert pair, the --tw-invert custom property stays on the unscoped selector (lines 112-119 keep custom properties because isRootOrTheme is also true), but the filter declaration lands on the selector that never matches. pb-css-scope.mjs was last changed at 1edc97d6 (2026-11-13), before the Nov 18 build, so the built output reflects the current pass. No styling escapes into Theia. The defect is a visible dark-mode styling bug on inputs and icons. The rubric places a user-visible correctness bug at medium, though it is cosmetic. *Checked at:* orca-overlay/files/pb-css-scope.mjs:32 and :67; orca/out/web/assets/pb-panes/pb-panes.css contains `.dark\:bg-input\/30:is(.dark :not(...),...) :where([data-pb-orca-pane], body > [data-radix-popper-content-wrapper], body > [data-slot]){background-color:var(--input)}`

---

**Per-phase review report of the same defect (64-CR-01).**

*Section CR-01 of `.planning/workstreams/orca/phases/64-orca-panes-as-powerbrowser-tabs/64-REVIEW.md`, verbatim:*

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

## overlay-renderer-01: closePane on one terminal split closes each mounted leaf widget's own active pane, not the requested leaf

- **Severity:** medium
- **Verdict:** CONFIRMED
- **Location:** `orca-overlay/files/src/renderer/src/pb/pb-pane-mount.tsx:1000`
- **Owner decision cited:** D-15

**What is wrong.** PowerBrowser flattens an Orca terminal tab with splits into one Lumino widget per leaf (orca-pane-widget.tsx). Each widget mounts its own TerminalPane with the same tabId and a different isolatedPaneKey, and each instance holds a full pane manager for every leaf of the tab. Upstream Orca mounts one TerminalPane per tabId. closePane writes activeLeafId into the store layout and then synchronously dispatches Orca's tab-wide window event. The upstream listener (use-terminal-pane-close-actions.ts:207-217) runs once in every mounted instance with that tabId and closes `manager.getActivePane()`. Nothing copies the store's activeLeafId into a live manager synchronously; the only store-to-manager path is a React effect that runs after a later render. Result: one close request closes up to N panes, and the panes it closes are each instance's current active pane, which can be a sibling leaf instead of the leaf the user closed.

**Scenario.** A user has an Orca terminal tab split into L1 and L2, shown as two PowerBrowser tabs W1 and W2, and last typed in W2, so the managers' active pane is L2. The user clicks the close button on W1. closePane({paneKey: <tab>:L1}) calls setTabLayout(activeLeafId=L1) and requestActiveTerminalPaneClose(tab). Both instances handle the event and request a close of L2, so L2's shell is killed and W1 stays open. If the instances' active panes differ (L1 in W1, L2 in W2), both leaves close. For an idle shell (probe verdict not 'live') the close needs no confirmation, so the user loses the wrong terminal session with no prompt.

**Preconditions.** An Orca terminal tab with two or more splits is hosted as separate PowerBrowser tabs, and the user closes a split other than the one that last had focus in its manager.

**Evidence.** pb-pane-mount.tsx:994-1002:
  const leaf = pick.paneKey.slice(pick.paneKey.indexOf(':') + 1)
  if (leaves.length > 1 && leaves.includes(leaf)) {
    // Orca's split close acts on the active leaf of the mounted pane; make this leaf active first.
    state.setTabLayout?.(tab.entityId, { ...snapshot!, activeLeafId: leaf })
    requestActiveTerminalPaneClose(tab.entityId)

upstream request-active-terminal-pane-close.ts: window.dispatchEvent(new CustomEvent(..., { detail: { tabId } })), and every subscriber with a matching tabId calls closeActivePane.
upstream use-terminal-pane-close-actions.ts:207-217: closeActivePane = () => { const pane = manager?.getActivePane() ?? manager?.getPanes()[0]; if (pane) handleRequestClosePane(pane.id) }; useEffect(() => onActiveTerminalPaneCloseRequest(tabId, closeActivePane), ...)
HostedPaneBody (pb-pane-mount.tsx:928-939) mounts one TerminalPane per leaf widget with the same tabId; orca-pane-widget.tsx:151 notes that "an isolated terminal leaf's root also holds its tab's other leaves' xterms, hidden".
upstream use-terminal-pane-reconciliation.ts:121-128 applies restoredLayout.activeLeafId to the manager only inside an effect.

**Suggested fix.** Do not route a leaf close through the tab-wide active-pane event. Close the leaf directly by its paneKey: resolve its numeric pane id in the instance that owns the isolated leaf (for example, an event carrying the paneKey that only the instance whose isolatedPaneKey matches handles), or call Orca's per-pane close path with that leaf's id. Add a live check that closes a background split and asserts that only that leaf's PTY ends.

**Verifier (CONFIRMED, medium).** I traced the whole path. orca-pane-widget.tsx:158-170 onCloseRequest calls api.closePane({worktreeId, tabId, paneKey}). pb-pane-mount.tsx:994-1002 writes activeLeafId=leaf into the store through setTabLayout, then calls requestActiveTerminalPaneClose(tab.entityId) in the same tick. Upstream request-active-terminal-pane-close.ts dispatches one window CustomEvent carrying only {tabId}. Every TerminalPane mounted with that tabId has a listener (use-terminal-pane-close-actions.ts:207-217), and each listener calls handleRequestClosePane(manager.getActivePane().id) on its own manager. HostedPaneBody (pb-pane-mount.tsx:925-939) mounts one TerminalPane per leaf widget, all with the same tabId; isolatedPaneKey only hides the other leaves, as the widget comment at orca-pane-widget.tsx:151 says. So every instance holds a full manager. The isolation layout effect (use-terminal-pane-reconciliation.ts:144-184 through applyExpandedLayoutTo) never calls setActivePane. The only store-to-manager application of activeLeafId (reconciliation.ts:117-125) runs in a later effect, and only when insertions or removals are non-empty; it returns early at line 79 otherwise. Nothing therefore syncs the active pane before the listeners run. A click or focus inside a pane sets that manager's active pane (pane-manager-pane-creation.ts:79-83), so W2's manager has L2 active after the user types there. W2's listener closes L2. If the probe verdict is not 'live', it closes without a prompt: executeClosePane -> closePaneLocally -> closeWebRuntimeTerminal(ptyId), or the layout-owner path. I found no deduplication or leaf check between the event and the close. Which leaf W1's own instance closes depends on its manager's active pane: L1 or L2, depending on restore and creation order. In either case one close request reaches N managers, and at least W2's closes its own active leaf. *Checked at:* pb-pane-mount.tsx:1000-1001 (store write, then a synchronous tab-wide event); orca/src/renderer/src/components/terminal-pane/use-terminal-pane-close-actions.ts:207-217 (closes the active pane of each manager); use-terminal-pane-reconciliation.ts:79 (early return skips the activeLeafId apply at 117-125); pane-manager-pane-creation.ts:79-83 (focus sets the active pane in that manager only)

## 64-WR-02: closePane closes the whole split terminal tab when the requested leaf is already gone

- **Severity:** warning (not refutation-checked)
- **Verdict:** REPORTED
- **Location:** `orca-overlay/files/src/renderer/src/pb/pb-pane-mount.tsx`

*Section WR-02 of `.planning/workstreams/orca/phases/64-orca-panes-as-powerbrowser-tabs/64-REVIEW.md`, verbatim:*

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

## 64-WR-03: A terminal record's key changes from entityId to a pane key when its layout appears, which disposes and renumbers the tab

- **Severity:** warning (not refutation-checked)
- **Verdict:** REPORTED
- **Location:** `orca-overlay/files/src/renderer/src/pb/pb-pane-mount.tsx`

*Section WR-03 of `.planning/workstreams/orca/phases/64-orca-panes-as-powerbrowser-tabs/64-REVIEW.md`, verbatim:*

**File:** `orca-overlay/files/src/renderer/src/pb/pb-pane-mount.tsx:789-795,831-836`
**Issue:** A terminal tab with no leaves yet is published as `key: tab.entityId, paneKey: null`. As soon as `terminalLayoutsByTabId` gains a leaf, the same pane is republished as `key: makePaneKey(entityId, leaf)`. TerminalPane itself writes the initial layout on mount (orca/src/renderer/src/components/terminal-pane/terminal-pane-mount-preparation.ts:215-218), so this transition can occur for a terminal that is first observed before its layout exists. `planPanes` (orca-pane-routes.ts:186-189) then disposes the first widget as a dropped key and creates a new one. The observer's `markGone` loop (orca-pane-observer.ts:219-224) tombstones the first name, so the new widget is minted under the next free name (for example `term2` instead of `term1`). The React root and any focus that `OrcaPaneCommands.create` gave the first widget are lost.
**Fix:** Give the leaf-less record a key that maps onto the eventual pane key. One option is to omit a terminal record until its layout has a leaf, since the widget shows Orca's waiting state anyway. Another is to have planPanes adopt a known `entityId` key into the first `entityId:<leaf>` key of the same tab instead of disposing it.

## 64-WR-04: subscribePanes runs paneRecords inside Orca's store listener with no guard, so a throw breaks Orca's own setState

- **Severity:** warning (not refutation-checked)
- **Verdict:** REPORTED
- **Location:** `orca-overlay/files/src/renderer/src/pb/pb-pane-mount.tsx`

*Section WR-04 of `.planning/workstreams/orca/phases/64-orca-panes-as-powerbrowser-tabs/64-REVIEW.md`, verbatim:*

**File:** `orca-overlay/files/src/renderer/src/pb/pb-pane-mount.tsx:863-883`
**Issue:** `paneRecords` calls `makePaneKey`, which throws by contract for a tab id containing `:` or a leaf id that is not a UUID (orca/src/shared/stable-pane-id.ts:20-26). It also calls `readStructuredChatTabName` and `resolveUnifiedTabLabel`. The call runs inside `useAppStore.subscribe`, and zustand runs its listeners synchronously inside `setState`. An exception therefore propagates into whichever Orca action changed the store: that store update stops partway, and the listeners after this one are skipped. The observer (orca-pane-observer.ts:131) cannot catch it, because it happens on Orca's side.
**Fix:** Wrap the work in a try/catch, record the failure in `mountErrors`, and keep the previous list:
```ts
let next: OrcaPaneRecord[]
try { next = paneRecords(state) } catch (error) { recordError('observation', 'subscribe')(error); return }
```

## 65-WR-01: The overlay's local predicate fails open: an unknown worktree, a folder workspace or a host-less worktree counts as local

- **Severity:** warning (not refutation-checked)
- **Verdict:** REPORTED
- **Location:** `orca-overlay/files/src/renderer/src/pb/pb-workspace-api.ts`

*Section WR-01 of `.planning/workstreams/orca/phases/65-orca-workspace-in-theia/65-REVIEW.md`, verbatim:*

**File:** `orca-overlay/files/src/renderer/src/pb/pb-workspace-api.ts:55-58`, `:104-120`

**Issue:**

- `worktreeIsLocal(undefined)` returns `true`. `openFileRecords` looks a file's worktree up only in `worktreesByRepo` (line 106). Folder workspaces live in `state.folderWorkspaces`, not in `worktreesByRepo`: Orca synthesises their worktree rows separately (`orca/src/shared/folder-workspace-worktree.ts:83-150`). So every folder-workspace file is classified `local: true` whatever the folder's `connectionId` or `executionHostId`, and it gets `worktreePath: ''`. Its diff and conflict routes then join paths against `''` (`orca-editor-routes.ts:135`), which gives `/<relativePath>` at the filesystem root.
- A worktree with no `hostId` is classified local. Orca itself falls back to the repo row's host in that case (`orca/src/shared/worktree-execution-host-resolution.ts:47-75`, `ai-vault-session-worktree.ts:219-221`). The type comment calls `hostId` optional "for pre-project-host metadata". Orca's own rule is "Unresolved ownership never authorizes a local read of a remote path" (same file, line 1-2).

If a remote row slips through, PB opens a `file:` editor at the remote path on the local disk and can save into a different file that happens to share the path. It also adds that path as a workspace root. Today this is latent for SSH, because D-20/D-31 record that headless orcad has no SSH stack. It becomes live on the weekly re-pin (D-26).

**Fix:** Resolve the owner the way Orca does, and fail closed:
```ts
const worktree = worktrees.get(file.worktreeId) ?? folderWorktrees.get(file.worktreeId); // from folderWorkspaceToWorktree
const host = worktree ? resolveWorktreeExecutionHost(createRepoRowExecutionHostLookup(state.repos), worktree) : undefined;
local: !!worktree && host?.kind === 'resolved' && hostIsPaired(host.hostId, paired) && ownerIsPaired(...)
```
Apply the same rule in `subscribeWorktrees` (line 162).

## overlay-renderer-03: A failed bootstrap is cached for the life of the document and Reconnect cannot recover it

- **Severity:** low
- **Verdict:** CONFIRMED
- **Location:** `orca-overlay/files/src/renderer/src/pb/pb-pane-mount.tsx:669`

**What is wrong.** bootstrap stores its first promise in `booting ??=`. A rejection at any step (pairing, the session-only assertion, installWebPreloadApi, or the services root) is returned unchanged to every later call. The Theia loader caches the same rejection (`this.booting ??= this.boot()`), and OrcaHostingStatus sets its repair API only after ready() resolves. After a failed boot, Reconnect therefore never calls repair, and nothing re-runs bootstrap. Side effects from the failed attempt (presetSessionOnly, closeActiveRuntimeClients, the wrapped runtimeEnvironments.subscribe and settings.set) also stay installed, so a retry would wrap them a second time.

**Scenario.** On the first start the offer file holds a value parseWebPairingInput cannot read, or installWebPreloadApi throws once. bootstrap rejects at that step. Every Orca pane then shows the failure page, and pressing Reconnect does nothing useful until the user reloads the Theia window.

**Preconditions.** Any bootstrap step throws once.

**Evidence.** pb-pane-mount.tsx:669: booting ??= (async () => { presetSessionOnly() ... await step('pairing', ...) ... })()
orca-pane-bundle.ts:66: return this.booting ??= this.boot();
orca-hosting-status.ts:130-131: this.bundle.ready().then(api => { this.api = api ... })
orca-hosting-status.ts:197-206: if (this.api) { await this.api.repair(...) } // Not booted yet: the loader's own hand-off loop pairs with this offer.

**Suggested fix.** On rejection, reset `booting` to null so that a later call can retry, and make the wrappers idempotent (install them once behind a flag). On the Theia side, let Reconnect re-run boot() when `failed` is set.

**Verifier (CONFIRMED, low).** pb-pane-mount.tsx:669 `booting ??= (async () => {...})()` keeps a rejected promise; nothing resets `booting`, and a grep for a reset found none. The Theia loader orca-pane-bundle.ts ready() `return this.booting ??= this.boot()` caches the same rejection, sets `failed`, and has no reset either. OrcaHostingStatus.onStart (orca-hosting-status.ts:130-134) sets this.api only on resolve. runReconnect (lines 197-207) skips repair when api is unset, clears the client reason under the comment 'the loader's own hand-off loop pairs with this offer', and that loop has already ended. restart() only sends orcaRestart to chrome and polls. Neither path re-runs boot, so recovery needs a Theia window reload. Side effects that ran before the failing step stay installed: presetSessionOnly, plus the subscribe and settings.set wrappers when the failure is at the services root. The precondition is a one-off bootstrap failure, and a reload recovers. *Checked at:* pb-pane-mount.tsx:669; theia/extensions/orca-panes/src/browser/orca-pane-bundle.ts ready() `this.booting ??= this.boot()`; theia/extensions/orca-panes/src/browser/failure/orca-hosting-status.ts:130-134 and :197-207

## overlay-renderer-04: mountErrors grows without bound

- **Severity:** low
- **Verdict:** CONFIRMED
- **Location:** `orca-overlay/files/src/renderer/src/pb/pb-pane-mount.tsx:196`

**What is wrong.** Every caught, uncaught and recoverable React error from every pane root and the services root is appended to a module-level array, and nothing removes entries. state() copies the whole array on each call. A surface whose error boundary catches on every resetKey change, for example a page that throws on each store update, adds an entry each time for the life of the document.

**Scenario.** A hosted Orca page throws during render on each activeView change. Each change adds one entry of up to 400 characters, and a long session collects thousands of entries, which every state() call copies.

**Preconditions.** A hosted surface errors repeatedly.

**Evidence.** pb-pane-mount.tsx:190: const mountErrors: MountError[] = []
pb-pane-mount.tsx:196: mountErrors.push({ kind, phase, message: String((error as Error)?.message ?? error).slice(0, 400) })
pb-pane-mount.tsx:1229: mountErrors: mountErrors.map((error) => ({ ...error }))

**Suggested fix.** Keep a fixed-size ring buffer, for example the last 50 entries plus a total count.

**Verifier (CONFIRMED, low).** pb-pane-mount.tsx:190 declares a module-level array. recordError (lines 194-198) is wired to onCaughtError, onUncaughtError and onRecoverableError for every pane root and the services root (rootOptions, lines 200-206), and it only ever pushes. state() at line 1229 copies the whole array on each call. There is no cap and no clearing. Growth needs a surface that errors repeatedly, for example an Orca error boundary that re-catches on each resetKey change. The memory cost per entry is bounded at 400 characters plus the kind and phase strings, so this is hardening. *Checked at:* orca-overlay/files/src/renderer/src/pb/pb-pane-mount.tsx:190, :196, :1229 (no splice, no length check, no reset anywhere in the file)

