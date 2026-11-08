---
phase: 39-v1-5-close-out
plan: 08
subsystem: testing
tags: [address-bar-live, nav-keys-live, harness, flake, 999.4, 999.5, 999.6, BMK-04, NAV-03, SMODE-04]

requires:
  - phase: 39-v1-5-close-out
    provides: "39-BASELINE rows address-bar-live and address-bar-live-self-test (listed:999.4), owned by 39-08"
provides:
  - "parkOnSegment: after a mode switch the pointer goes back onto the clicked segment (999.4)"
  - "clickSegment clicks only a settled toggle; mode-defaults and mode-lifetime teardowns report a failed return to Browsing (999.6)"
  - "modeTokens fromEmpty settles before typing; a lost keystroke is a BROKEN failure (999.6)"
  - "bookmarks-toolbar's chevron read waits for every seeded overflow item"
  - "scenario back-no-interaction and plant history-entry-unmarked in verify-nav-keys-live (999.5)"
affects: [39-18, 39-19]

actuals:
  tokens: 3600
  tasks: 3
  commits: 6
plan_head_before: 5d0dfa95a3d88cb529e379d9a5eca64390b3b99f
plan_head_after: 715e334eb45915d32d106962ea4a8b3c2b843cd5

tech-stack:
  added: []
  patterns:
    - "After a trusted click that changes layout (a PowerBrowser mode switch), put the pointer back on the control it clicked and wait until it is hovered. A resting pointer that the layout slides a tab under opens a preview card, and that card hides every page"
    - "Click a control only when its centre has held still for one poll and elementFromPoint returns it. A click at a centre read just before a re-layout lands on the neighbour"
    - "A teardown that fails to restore session state must report the failure, never .catch(() => undefined). A swallowed teardown failure shows up three scenarios later as someone else's flake"

key-files:
  created: []
  modified:
    - scripts/verify-address-bar-live.mjs
    - scripts/verify-nav-keys-live.mjs
    - .planning/ROADMAP.md
    - .planning/phases/33-bookmarks-history-and-the-full-menu/33-UAT.md

key-decisions:
  - "999.4 was not a focus leak. A Theia tab preview card, a blocking layer, kept the overlay hidden. Two scenarios caused it (mode-lifetime and mode-defaults), both through the shared segment-click path, so the fix is in switchUiMode and mode-lifetime's teardown rather than in one scenario"
  - "999.6's cause is mode-defaults' teardown, not mode-tokens. Its return to Browsing clicked a segment that moved 100 px when the saved custom mode's row appeared, landed on Organising, and swallowed the error. Organising's default pill mode is Tabs, which is exactly what the *x step saw"
  - "The plant for 999.5 shadows the overlay's fixupAndLoadURIString, because PowerBrowserAPI is frozen and webTabNavigate cannot be wrapped. It clears the mark webTabNavigate has just set, which is the pre-1642f2d7 behaviour"

requirements-completed: [BMK-04, NAV-03, SMODE-04]

duration: 175 min
completed: 2026-11-06
status: complete
---

# Phase 39 Plan 08: 999.4, 999.5 and 999.6 harness fixes Summary

**bookmarks-toolbar is order-independent, and three consecutive full address-bar runs each passed 40 of 40. The mode-tokens `*x` flake came from mode-defaults' teardown clicking a moving toggle, and search,mode-tokens now passes 20 of 20. A new back-no-interaction leg proves Back after a navigation nobody touched, and a plant goes red on the pre-1642f2d7 behaviour. All three changes are harness-only; no product code changed.**

## Performance

- Duration: about 175 min (18:05Z to 21:05Z), almost all of it live runs
- Tasks: 3 of 3, plus two follow-up instrument fixes (see Deviations)
- Live sessions, all counted, all headless (**headed runs: 0**):
  - Full address-bar runs: 2 diagnostic full runs, 2 prefix bisect runs, 2 pair runs, 3 runs at the Task 1 state, 4 traced full runs, 3 final runs
  - search,mode-tokens loops: 20 before the fix (traced), 20 after, and 3 after the follow-up
  - search,mode-defaults,mode-tokens: 12
  - Address-bar self-test: 1. Plant sessions through a scratch driver: 8
  - Nav-keys: 1 scenario run and 1 self-test

## Task 1: 999.4 bookmarks-toolbar (0b69d339)

**Reproduction.** The baseline line was reproduced in the first diagnostic full run: `bookmarks-toolbar: FAIL -- broken instrument: the session tab's page could not be focused`. A temporary trace was added at the failure. At that point:
- `overlayVisibility` was `"hidden"`.
- The only visible blocking layer was `pb-tab-preview :: New Tab`, a TAB-07 hover card for an unseen tab.
- The session tab widget was `isVisible: true`.

**Which scenario left it.** A per-scenario trace of the trusted pointer and the open layers (second full run) showed the sequence:
- After mode-lifetime, the pointer was on the Browsing segment at (1124,53).
- After mode-defaults, the pointer was at **(1024,20) on a `.pb-tab`**.
- From bookmark-star on, the `New Tab` preview card was open.

The mechanism: Organising puts the bar at the window's top edge, which is where Browsing has its tab strip. A segment click made in Organising (or in the custom mode) therefore leaves the pointer over the strip once Browsing comes back. When an unseen tab slides under the resting pointer, its preview card opens, and nothing moves the pointer off it again.

**Bisect, as the plan asked:**

| Command | Result |
|---|---|
| `node scripts/verify-address-bar-live.mjs --scenario bookmark-editor,bookmarks-toolbar` | green |
| `--scenario search,mode-defaults,bookmarks-toolbar` | green: too few tabs are open for one to sit under (1024,20) |
| `--scenario token-cookie,...,mode-defaults,mode-tokens,bookmark-star,bookmark-editor,bookmarks-toolbar` (every scenario up to bookmarks-toolbar) | **red**: the same line, with the `New Tab` card |
| The same list without mode-defaults | **red**: the pointer was left at (1124,20) by mode-lifetime's Organising round trip, and the card was `Draft Gamma` |

So no single pair reproduces it. The leak needs a mode switch through Organising or a custom mode, plus enough open tabs that one lands under the pointer. Two scenarios (mode-lifetime and mode-defaults) leak this way, and both go through the same segment-click path.

**Fix.** `parkOnSegment` moves the pointer back onto the clicked segment, then does a settled read: the segment is `:hover` and no `.pb-tab-preview` is open. If that never holds, it fails BROKEN.
- `switchUiMode` calls it after every switch.
- mode-lifetime's teardown calls it.
- bookmarksToolbar's focus check is unchanged, and `git show 0b69d339` touches no line of bookmarksToolbar.

## Task 2: 999.6 mode-tokens `*x` (c17a549d, follow-up 715e334e)

**Before-fix rate.**
- `search,mode-tokens`: 0 of 20, run with a mode-set recorder and a trace of modeState, inputValue and the input around every step.
- `search,mode-defaults,mode-tokens`: 0 of 12.
- Full address-bar runs in this session: **1 of 11**: `mode-tokens: FAIL -- the *x token did not enter Address: "*x" left the mode "tabs" and the text "*x"`.

That same run also failed reopen-closed, history-menu, clear-history and actions-list, while bookmarks-toolbar passed. That pattern fits a session left in **Organising**:
- `tabs` is `DEFAULT_MODE_BY_UI_MODE.organising`.
- bookmarksToolbar restores whatever mode it found at its start.
- `*x` is the only step whose expectation is the default mode itself.

**Cause.** mode-defaults' teardown returns from the saved custom mode by clicking the Browsing segment at a centre it has just read. The custom mode's row is added to the toggle only when the perspective change reaches the bar, and it shifts the stock segments 100 px left. The pointer traces show this: the Browsing segment is at x=1124 before mode-defaults and x=1024 after. A click in that window lands on Organising. The 10 s wait then threw, and `.catch(() => undefined)` swallowed the error. This is a race, which is why the failure rate is low.

**Fix (c17a549d):**
- `clickSegment` clicks only when three things hold together: the segment's centre has held still for one poll, the segment is `elementFromPoint` at that centre, and the toggle's active segment agrees with `body[data-pb-mode]`.
- The mode-defaults and mode-lifetime teardowns now report a failed return to Browsing.
- `fromEmpty()` waits, with a bounded settled read, for `bar.inputValue === ''`, an empty input, and `bar.mode === bar.defaultMode()` before typing.
- The silent catch around typing is gone.

**After.** `search,mode-tokens` passed 20 of 20 (`${TMPDIR}/pb-39-08-mt-{1..20}.log`). The three final full runs passed mode-tokens 3 of 3.

## Task 3: 999.5 back-no-interaction (039bc791)

- **Scenario `back-no-interaction`.** It sits after history-error in SCENARIOS and never calls `interactWith`:
  1. Open `/n1`.
  2. Navigate to `/n2` through `widget.navigate`. This is the method the pill's commit calls (`chrome-bar-widget.tsx:790`), and it reaches `webTabNavigate`.
  3. Back must be enabled, and clicking it must produce a loaded push for `/n1`.

  Both failure paths say `Back did not return after a navigation with no page interaction`.
- **Plant `history-entry-unmarked`.** PowerBrowserAPI is frozen, so webTabNavigate cannot be wrapped. Instead, an own `fixupAndLoadURIString` on the overlay clears `hasUserInteraction` on the entry being left, straight after webTabNavigate marked it. That is the pre-1642f2d7 behaviour. After `/n2` loads, the plant reads `sessionHistory.getEntryAtIndex(index - 1).hasUserInteraction === false`, then notes `PLANT history-entry-unmarked applied`. The `finally` block deletes the shadow.
- **TDD.**
  - RED is the plant session from `--self-test`: `back-no-interaction: FAIL -- Back did not return after a navigation with no page interaction: Back stayed disabled on /n2`. The failure is on the planned assertion, for the intended reason: Back is disabled because requireUserInteraction skips the unmarked /n1.
  - GREEN is `node scripts/verify-nav-keys-live.mjs --scenario back-no-interaction`, which prints `back-no-interaction: PASS`.
  - The product behaviour already shipped in 1642f2d7, so there is no feat commit. `gsd_run check tdd-red-evidence` was not used: the harness prints its own line format, which none of the classifier's adapters accept. The plant is the project's red mechanism.

## Verification (real output)

- **999.4, three consecutive full runs** of `node scripts/verify-address-bar-live.mjs` at c17a549d. Each exited 0 with `40 PASS`, including `bookmarks-toolbar: PASS` and `mode-tokens: PASS` (`/tmp/nix-shell.75PsxP/pb-39-08-ab-{1,2,3}.log`). Before that, the Task 1 state passed 6 consecutive full runs with bookmarks-toolbar PASS. The one red run in that stretch was the 999.6 failure above.
- **999.6**: `mt loop done: 20/20 PASS`.
- **999.5**:
  - `back-no-interaction: PASS`.
  - `verify-nav-keys-live --self-test: PASS -- the clean control is green and all 12 planted faults went red`, including `ok  history-entry-unmarked -> red on back-no-interaction`.
- **Address-bar self-test**, at 039bc791:
  - The clean control is **green**, which closes the baseline row's failure.
  - 44 of 46 plants red.
  - `token-kept` went red for the wrong reason (BROKEN), because of my c17a549d. That is fixed in 715e334e: token-kept is red in 2 of 2 sessions on `the * token did not enter Bookmarks`.
  - `ctrl-d-everywhere` stayed green. It is pre-existing: green 3 of 3 with the pre-39-08 harness (5d0dfa95) as well. See Deferred.
  - Because of ctrl-d-everywhere, the self-test row still exits 1.
- **`scripts/verify-platform.sh --quick`**: `verify-platform: PASS -- all checks passed`, run with the Task 1 file staged and again with the Task 3 file staged. The FAIL lines in the log are group-channel's planted reds. No NOT SCORED lines.
- **`scripts/check-internals-boundary.sh`**: PASS.
- **`nix develop .#theia --command bash scripts/diff-theia-core.sh`**: `PASS -- zero changes inside @theia/*`. No Theia code changed, so no `yarn build`.
- **ROADMAP**: all three plan greps match (`Test 3`, `Test none: AB-9`, `Test 2`, each `[x]` and `fixed in 39-08`).

## Deviations from Plan

**1. [Rule 1 - Bug, instrument] The chevron read raced the seeded bookmarks (76231ef3)**
- Found during Task 1: two diagnostic full runs failed `the chevron menu must list exactly the hidden items`. The read had items 4..28 hidden; the chevron, clicked a moment later, listed 4..29.
- This is the `address-bar-live-self-test` baseline row that 39-BASELINE assigned to 39-08 under 999.4.
- Fix: the settle also waits for every seeded title. The expect string is unchanged.
- Committed apart from Task 1 so that 0b69d339 touches no line of bookmarksToolbar.

**2. [Scope] Pair bisect could not isolate 999.4**
- The plan expected some `<earlier>,bookmarks-toolbar` pair to reproduce the failure. None can, because the leak also needs enough open tabs to put one under the pointer.
- The evidence is the per-scenario pointer and layer trace plus the two prefix runs above.
- Two scenarios leak, so the fix is in their shared helper.

**3. [Scope] 999.6 did not reproduce in the plan's loop**
- 0 of 20 before the fix in `search,mode-tokens`, so the before-fix rate is 1 of 11 full runs.
- The cause was found in mode-defaults, not in fromEmpty. The plan's fromEmpty settle and BROKEN typing failure were added anyway, as asked.

**4. [Rule 1 - Bug, caused by this plan] token-kept could not score (715e334e)**
- The BROKEN typing failure also caught that plant's fault: a token left in the pill as typed.
- Now only text other than the typed text counts as a lost keystroke.

**5. [Transparency] `commits: 6` is measured, and it counts one foreign commit**
- `git rev-list --count 5d0dfa95..715e334e` is 6. One of those is c5a8a56f `fix(47-04)`, from the concurrent session on main.
- 39-08 made 5 code commits, and the docs commit comes after this SUMMARY.

## Deferred Issues

- **`ctrl-d-everywhere` (address-bar-live-self-test) stays green on bookmark-keys.**
  - Seen: 1 of 1 self-test run and 3 of 3 driver sessions with the 39-08 harness, plus 3 of 3 with the pre-39-08 harness (5d0dfa95).
  - Pre-existing and outside 999.4/5/6.
  - First lead, not verified: the bookmark command may be disabled while the README editor is current, so Theia skips the planted binding and Monaco keeps Ctrl+D.
  - Recorded in `.planning/WINDOWS.md` as a phase-39 deviation for 39-18. The address-bar-live-self-test row stays red on this plant alone until it is fixed.

## Known Stubs

None.

## Threat Flags

None. T-39-20's mitigation was applied:
- Every fix restores state or settles before acting.
- No expect string changed.
- The swallowed typing error and both swallowed teardown errors now report.
- Acceptance was 3 full runs and a 20-run loop.

## For 39-09 onward

- **Residual flakes.** The menu-edit Paste and iframe-edit-rows flakes (39-18) did not hit any run here, because no page-furniture run was needed.
- **The class behind 999.4 and 999.6.** Trusted pointer input that changes layout leaves the pointer somewhere new. If another harness clicks the mode toggle with a real pointer, give it the same park-and-settle.
- **A tab preview card hides every page.** If a focusOverlay suddenly fails in a long session, look for a visible `.pb-tab-preview` first.
- **Running these harnesses.** Live runs here used the Bash sandbox off. One full address-bar run takes about 7 minutes. The address-bar self-test takes about 30 minutes.

## Commits

- 0b69d339 fix(39-08): 999.4 a mode switch parks the pointer back on its segment
- 76231ef3 fix(39-08): bookmarks-toolbar reads the hidden set only once every overflow item is in the row
- c17a549d fix(39-08): 999.6 the *x flake: mode-defaults' teardown clicked a moving toggle
- 039bc791 test(39-08): 999.5 back-no-interaction: Back after a pill navigation nobody touched
- 715e334e fix(39-08): mode-tokens tells an unconsumed token from a lost keystroke

## Self-Check: PASSED

The modified files and SUMMARY exist; commits 0b69d339, 76231ef3, c17a549d, 039bc791 and 715e334e are ancestors of HEAD; backNoInteraction has no interactWith call.
