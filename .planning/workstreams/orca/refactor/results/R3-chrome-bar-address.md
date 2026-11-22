# Result: R3-chrome-bar-address

Branch: worktree-agent-a058fd20bb73ff7ca   Base: 08e6f64393f5cc8e54319341079da22657e99bd2   Final: the commit that adds this record (last code commit 32a08bae)

| # | Type | Commit | Files | What and why it is safe |
|---|---|---|---|---|
| 1 | fix | f028f702 | address-bar.tsx, scripts/verify-address-bar-shimmer.mjs (new) | closeDropdown and textEdited clear `shimmer`: they invalidate the query in flight, which then cannot clear the row it set |
| 2 | fix | 9f60b7a8 | address-bar.tsx | requestIcons dedupes the urls and sends them 10 per placesFavicons request (chrome reads only the first 10) |
| 3 | refactor | 6678858c | address-bar.tsx | Alt+Enter, Enter and Shift+Delete use highlightedRow(), which has the same expression; a recompose before showComposedRows, which recomposes first, removed |
| 4 | refactor | b2a473ea | address-bar.tsx | engineIcon(name) replaces four copies of the engineList find-by-name-then-icon-or-null lookup |
| 5 | refactor | 15a98115 | address-bar.tsx | hoverTip(content, position) replaces seven identical requestHover handlers; the content is the same render-time value |
| 6 | refactor | c1c952f0 | address-bar.tsx, chrome-bar-widget.tsx | exported dropdownMaxHeight(top) replaces four copies of the min(432, innerHeight - top - 8) cap; DROPDOWN_MAX_HEIGHT stays exported |
| 7 | refactor | 85a3e41c | address-bar.tsx | messageBody(message) renders the no-search, paste-failure and commit-failure bodies (same markup, same copy keys) |
| 8 | perf | ca0efc18 | address-bar-modes.ts | Tabs mode ranks from one-pass position maps instead of indexOf scans per comparison (per debounced keystroke); ids in `recent` are unique, so the order is unchanged. Checked against the old code on 2000 random cases |
| 9 | perf | 37cfd0b5 | chrome-bar-widget.tsx | the bookmarks toolbar's 10-url favicon chunks run together and merge in the same order (runs on every bookmarks-changed push) |
| 10 | refactor | a615f325 | chrome-bar-widget.tsx | inOrder(children) replaces three copies of the padded-index sortString map |
| 11 | refactor | 32da09fc | address-bar.tsx | modeSends(mode = this.mode); cycleMode reads the next mode through it instead of repeating the MODE_SENDS lookup |
| 12 | refactor | 32a08bae | address-bar.tsx | identityTab() replaces the focused-widget-else-current-web-tab expression in identityState and openSitePanel |

## Bugs fixed
- address-bar.tsx:1087 (closeDropdown) and :1369 (textEdited) at base: both bump querySeq, so a query whose 150ms timer had set `shimmer` finished non-current and left it true. After Escape over a slow query, the next dropdown (for example "@" alone, or the first rows of the next query) showed a shimmer row with nothing outstanding. Fixed in f028f702. Check: scripts/verify-address-bar-shimmer.mjs, clause "every invalidating member clears the shimmer row"; its --self-test removes each clear and requires red.
- address-bar.tsx:1305 (requestIcons) at base: sent every uncached row url in one placesFavicons request. Chrome reads only `urls.slice(0, 10)` (PowerBrowserAPI.sys.mjs:6298). Tabs mode has no row cap, so a row past the tenth uncached url never got its Places favicon (for example restored tabs with no pushed favicon). Fixed in 9f60b7a8. no-check: the cap is applied chrome-side at runtime, and a text check would only pin the chunk loop.

## Registry requests
- scripts/verify-address-bar-shimmer.mjs: rows `"address-bar-shimmer|node $REPO_ROOT/scripts/verify-address-bar-shimmer.mjs"` and `"address-bar-shimmer-self-test|node $REPO_ROOT/scripts/verify-address-bar-shimmer.mjs --self-test"`, next to address-bar-modes in the --quick group

## Red by design
None.

## Blocked by check
None.

## Handoffs
- R4: theia/extensions/chrome-bar/src/browser/extensions/extension-actions-widget.tsx:135 repeats the height cap. Optional: import `dropdownMaxHeight` from '../address-bar/address-bar' and write `maxHeight: dropdownMaxHeight(top)`. It is a duplication only, not a bug.
- No Firefox touchpoint was added, removed or moved.

## Needs owner
None.

## Not done
- forgetHistoryRows (address-bar.tsx:940) recomposes Address rows even in a local mode. This is latent: the pill blurs, and so closes the dropdown, while the Clear Recent History picker has focus.
- refreshEngines rewrites the engine setting's schema on every pill focus even when the list is unchanged. A focus event is not a hot path.
- Caching the input element instead of `pillRef.querySelector('input')`: no call is on a per-keystroke loop.
- The orphaned doc comments (address-bar.tsx:449-453, chrome-bar-widget.tsx:84): changing them would only edit comments.

## Quick gate
456 PASS, 0 FAIL, 0 SKIP (scripts/verify-platform.sh --quick inside nix develop .#theia, log quick-gate.log in the worktree). The new check, which is not yet registered, passes and its self-test passes.
