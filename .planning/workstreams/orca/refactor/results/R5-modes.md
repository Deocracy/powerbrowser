# Result: R5-modes

Branch: worktree-agent-a1cf694d1c1a60a12   Base: 08e6f64393f5cc8e54319341079da22657e99bd2   Final: 370af23d (code); this record is the commit after it

| # | Type | Commit | Files | What and why it is safe |
|---|---|---|---|---|
| 1 | fix | 4648ef46 | main-area-exemption.ts | stripSavedLayouts keeps the recorded ids of a layout it already stripped; the strip itself, and what and when it exempts, are unchanged |
| 2 | fix | ef79964c | mode-service.ts, setups-service.ts, scripts/verify-modes-notice-timer.mjs | a newer notice clears the older notice's removal timer, as organising-widget.ts already does |
| 3 | perf | d4bcf65b | group-model.ts | load sends the per-group reads and the loose read together (any failure still fails the whole load, NG-012); the watchClose pass uses one first-wins key map instead of a main-area scan per Theia tab; showsInStrip computes the key once |
| 4 | perf | acc618e2 | organising-widget.ts | tileCards reads every host's client size before writing any; each box has a fixed inline size, so no host's writes changed another host's size; stackCards receives the same values it read |
| 5 | refactor | 370af23d | setups-service.ts | snapshotWindows activeTab: `some()` then the same `find()` is the `find()` alone |

## Bugs fixed
- main-area-exemption.ts:205-221 (base): every switch strips every saved layout. A layout that no switch had re-saved since its first strip has no mainPanel left, so `strippedIds` was overwritten with an empty set. afterSwitch therefore re-docked nothing if any other switch ran between leaving a mode and returning to it, which contradicts the header's statement that afterSwitch re-docks exactly those widgets. Commit 4648ef46. no-check: the behaviour depends on stock PerspectiveService's saved-layout map across several switches, and no check outside the browser can drive that.
- mode-service.ts:661-671 and setups-service.ts:1323-1333 (base): each notice set the shared status-bar element and removed it 4 s later on its own timer, so an older notice's timer removed a newer notice early. Commit ef79964c. Check: scripts/verify-modes-notice-timer.mjs::flash() restarts its removal timer (the self-test plants the pre-fix body in each of the three files).

## Registry requests
- scripts/verify-modes-notice-timer.mjs: `"modes-notice-timer|node $REPO_ROOT/scripts/verify-modes-notice-timer.mjs"` and `"modes-notice-timer-self-test|node $REPO_ROOT/scripts/verify-modes-notice-timer.mjs --self-test"`, both in the --quick set beside the gui08 rows.

## Red by design
None.

## Blocked by check
- gui08-canvas-geometry (clause 4a, focusBody): this check blocks folding moveCardFocus's scope selection into cardScope (organising-widget.ts:2109-2147 at base). The check requires the selectors `.pb-org-box-cards`, `.pb-org-expand-cards` and `is-loose` to appear in moveCardFocus's own body.

## Handoffs
None.

## Needs owner
- group-model.ts:541 (base): a grouped Theia tab that is open (an editor, a terminal or the Welcome view) never shows its session-captured preview. That preview is shown only when the same tab is loose, but scheduleShellCapture's comment says the capture exists "so its card has a picture of how it last looked". Fixing it changes what the user sees. Proposed fix: `thumbnail: tab.thumbnail ?? this.sessionThumbs.get(tab.uri) ?? null` in the claimed-tab branch.

## Not done
- Skipping OrganisingWidget renders while it is detached (outside Organising): separate() and live rows read the canvas DOM while it is detached, so the change cannot be shown to preserve behaviour.
- separate() writes one push per box in sequence, with a full render after each. Running the writes in parallel or batching the renders changes the visible stepping and the order of save errors.
- showsInStrip still calls locateCard, which is O(cards), for every strip tab. A key-to-group index would have to be kept in step with every mutation path, including writes that change state without firing an event.
- SetupsService.webTabAccess is never pruned. Pruning a closed tab's entry would change how old a tab later reopened on the same row counts as at restore.
- renderCanvas and renderLoose each call canvasInner(). The second reading can differ after the rebuild changes overflow.
- loadX and reloadX have identical bodies in mode-service and setups-service, but their comments describe different failure meanings. Merging them is a matter of taste.
- modes.css: no dead rule. Every unmatched selector is a `pb-org-box-grip-*` class built from BOX_EDGES.

## Quick gate
456 PASS, 0 FAIL, 0 SKIP (`scripts/verify-platform.sh --quick` inside `nix develop .#theia`, log quick-gate.log in the worktree). The new check is unregistered and is not counted; run on its own, it and its self-test pass.
