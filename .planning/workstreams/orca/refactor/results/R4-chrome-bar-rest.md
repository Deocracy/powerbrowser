# Result: R4-chrome-bar-rest

Branch: worktree-agent-a5e6a32362a775d46   Base: 08e6f64393f5cc8e54319341079da22657e99bd2   Final: the commit that adds this record (last code commit 4a631dfe)

| # | Type | Commit | Files | What and why it is safe |
|---|---|---|---|---|
| 1 | fix | 44379462 | tab-strip-widget.tsx, scripts/verify-widget-dispose-collection.mjs | TabStripWidget's own `toDispose` field replaced BaseWidget's collection; removed, so the strip pushes into the inherited one (same listeners, now also onDidDispose and the React root unmount on dispose) |
| 2 | refactor | aa874d79 | tab-strip-widget.tsx | mainPanel.onDidChangeCurrent disposable and the layoutModified slot go into toDispose; same handlers, only dispose differs |
| 3 | perf | fbd5085c | tab-strip-widget.tsx | aimReorder (every pointermove of a reorder drag and every edge-scroll frame) read shownTabs three times and dropBefore ran one querySelectorAll per tab; now one strip read passed down and one id->node map (first node per id, as tabNode found) |
| 4 | perf | 207f43a7 | tab-strip-widget.tsx | render and stackWidgets test home-pane membership with Set.has instead of Array.includes inside a walk of every main-area tab (O(n^2) per render) |
| 5 | refactor | 4eb7f8e6 | chrome-bar-commands.ts | CHROME_BAR_FULL_SCREEN_COMMAND alias removed: no reader in theia/, scripts/, powerbrowser/ or orca-overlay/ (grep -w); the _ID const is unchanged |
| 6 | refactor | 4a631dfe | extensions/extension-actions-widget.tsx | `as CommandMenu` cast on the row-menu leaf removed; the literal already satisfies the type (tsc -b passes), emitted JS identical |

## Bugs fixed
- theia/extensions/chrome-bar/src/browser/tab-strip-widget.tsx:233 (base): `protected readonly toDispose = new DisposableCollection();` ran after BaseWidget's constructor and replaced its collection (onDidDisposeEmitter, its fire, toDisposeOnDetach, scroll and visibility emitters, ReactWidget's root unmount), so disposing the strip never fired onDidDispose or unmounted the React root. 44379462, scripts/verify-widget-dispose-collection.mjs::strip-shadows-todispose

## Registry requests
- scripts/verify-widget-dispose-collection.mjs: add to the quick block of scripts/verify-platform.sh:
  `"widget-dispose-collection|node $REPO_ROOT/scripts/verify-widget-dispose-collection.mjs"`
  `"widget-dispose-collection-self-test|node $REPO_ROOT/scripts/verify-widget-dispose-collection.mjs --self-test"`

## Red by design
None.

## Blocked by check
- verify-tab-strip (keys, clause 8): caching `this.tabKey(widget)` in a local in onTabClick, togglePin and renderTab would be red, because every pinnedIds/selectedIds argument must be the literal `this.tabKey(...)`; not changed.
- verify-tab-strip --self-test plant on reorderTo: `const before = this.clampDrop(widget, requested);` is pinned text, so reorderTo keeps its own shownTabs read; only aimReorder shares one.

## Handoffs
None.

## Needs owner
None.

## Not done
- chrome-bar.css: every class, id and attribute selector in it and in side-panel-top-tabs.css is set somewhere in theia/ src (strict-boundary grep, modifier classes checked per use); no dead rule found, and the two adjacent `.pb-tab.is-pinned` blocks are left apart (merging is reformatting).
- chrome-bar-copy.ts: `untitledPage` and `viewSourceTooltip` have no product reader, but copy is pinned by verify-shell-error-copy and the brief forbids copy changes.
- chrome-bar-commands.ts: the thirteen `isEnabled: () => !!currentWebTab()` one-liners left as they are (a helper would be taste only).
- tab-strip bulkMenuRows `can()` rebuilds tabMenuRows per selected tab per row: runs once per right-click, not a hot path.
- page-context-menu.ts `void this.send(...)` for a gone tab: WebTabChannel.request never rejects, so no unhandled rejection.

## Quick gate
455 PASS, 1 FAIL, 0 SKIP. fixer-isolate-self-test: not caused by this lane (a read-only bind of a planted socket under /run/user failed under the nine-lane load; no file it reads was touched); re-run alone with `--only fixer-isolate-self-test`: PASS. The new check is not registered yet, so it is not counted; run by hand: PASS and --self-test PASS.
