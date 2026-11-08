---
phase: "34"
slug: "tab-strip"
status: static-green-live-deferred
nyquist_compliant: false
wave_0_complete: true
marked: "2026-11-01"
created: "2026-10-22"
---

# Phase 34 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.
> Source: `34-RESEARCH.md` § Validation Architecture.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Plain-node derive-and-compare scripts plus BiDi live scripts on `scripts/lib/pb-live-probe.mjs`, one driver: `scripts/verify-platform.sh` |
| **Config file** | The registry inside `scripts/verify-platform.sh` (quick block for `--quick`; the live block for full runs) |
| **Quick run command** | `scripts/verify-platform.sh --quick` |
| **Full suite command** | `scripts/verify-platform.sh` (needs the built binary and the last Theia app build) |
| **Estimated runtime** | ~90 seconds quick; live rows add minutes (one probe-shell session takes about 40 s) |

Proof tiers: **S** is a static gate (`--quick`, with `--self-test`). **D** is a sidecar DOM measure on :4000 (Theia-frame layout only; strip geometry, chevron visibility, pinned width). **L** is the live built shell with `-purgecaches`, push recorder, page-realm `probe()`.

---

## Sampling Rate

- **After every task commit:** `scripts/verify-platform.sh --quick`.
  - Stage new files first: the brand scan reads `git ls-files`.
  - After any `PowerBrowserAPI.sys.mjs` edit, run `node scripts/verify-ng-040-internals-catalogue-lines.mjs --fix` in the implementing action (N1 — never in `<verify>`, where repair-before-read can never go red; list `powerbrowser/INTERNAL-APIS.md` in that task's files), then `bash scripts/check-internals-boundary.sh --catalogue`. The verify chain runs the catalogue check WITHOUT `--fix`.
- **After every plan wave:** `--quick`, then a Theia build, then `node scripts/verify-tab-strip-live.mjs --scenario <that plan's scenarios>`.
- **Before `/gsd-verify-work`:** the full `scripts/verify-platform.sh` and both new gates' `--self-test` must be green.
- **Max feedback latency:** ~90 seconds (quick).

---

## Per-Task Verification Map

Requirement-level map; plans bind task IDs to these rows.

| Requirement | Behavior | Threat Ref | Tier | Automated Command | File Exists | Status |
|-------------|----------|------------|------|-------------------|-------------|--------|
| TAB-01 | Menu lists exactly the ROADMAP contract items; each disabled exactly when its predicate says so; copy from `chrome-bar-copy.ts` | T-34-06 | S + L | S: `node scripts/verify-tab-strip.mjs` checks 1, 2, 3, 6 (+ `--self-test` plants menu-item-removed, copy-row-removed, occlusion-selector-dropped, current-widget-fallback); L: `LIVE(menu)` | ✅ | S ✅ green 2026-11-01 · L ⏸ deferred to end-of-milestone live pass |
| TAB-01 Mute | Mute/Unmute calls Phase 32 `webTabMute`; label follows `soundPlaying`; no audio code in this phase | T-34-06 | S + L | S: `node scripts/verify-tab-strip.mjs` checks 4 (Mute is a call, no kind) and 9 (bulk Mute delegates to the single-tab row) (+ `--self-test`; no dedicated no-mute-impl plant exists, the kind plants cover it); L: `LIVE(menu)` and `LIVE(multi)` | ✅ | S ✅ green 2026-11-01 · L ⏸ deferred to end-of-milestone live pass |
| TAB-02 | Drag reorders home-pane `TabBar` order; drop index = midpoint rule; no chrome kind; survives mode switch in-session | T-34-02 | S + L | S: `node scripts/verify-tab-strip.mjs` check 4 (+ `--self-test` plant uncatalogued-kind-added-34-02); L: `LIVE(reorder)` and `LIVE(modes)` (order across Coding/Organising/Browsing) | ✅ | S ✅ green 2026-11-01 · L ⏸ deferred to end-of-milestone live pass |
| TAB-03 | Middle-click closes (auxclick/mousedown button 1 consumed per upstream EventStateManager.cpp:6375-6407; seeded contenteditable input/paste detector silent after a caught positive control) | T-34-01 | S (partial) + L | S (partial, wiring only): `scripts/verify-platform.sh --only shell-error-copy-no-internals` (emptyStripTooltip, dropTabFailed pinned) and `node scripts/verify-tab-strip.mjs` check 4 (no kind for close/drop); behaviour proof is L only: `LIVE(middle,double,drop)` | ✅ | S ✅ green 2026-11-01 (copy and no-kind only) · L ⏸ deferred to end-of-milestone live pass |
| TAB-04 | Overflow scrolls; chevron iff `scrollWidth > clientWidth`; List All mirrors strip order pinned-first; pick activates + scrolls into view | — | S + D + L | S: `node scripts/verify-tab-strip.mjs` check 7 (+ `--self-test` plant chevron-without-overflow); D: sidecar DOM measure (`DOM-MEASURE` below); L: `LIVE(overflow)` | ✅ | S ✅ green 2026-11-01 · D ⏸ deferred · L ⏸ deferred to end-of-milestone live pass |
| TAB-05 | Pinned tabs icon-only, sticky-left, excluded from Close Others/Left/Right + bulk close; pins restore after restart pinned-first order-kept with reopened rowKey equal to the stored key (W1: `WebTabOpenHandler.openUrl(url, rowKey)` → `createWidget` → `WebTabOptions.key`, web-tab.ts:826-852) | T-34-05 | S + L | S: `node scripts/verify-tab-strip.mjs` checks 8, 10 (+ `--self-test` plants url-keyed-pin, unbounded-pin-store, stale-key-repinned); L: `LIVE(pin-restore)` | ✅ | S ✅ green 2026-11-01 · L ⏸ deferred to end-of-milestone live pass |
| TAB-06 | Ctrl/Cmd-toggle, Shift-range, Esc/click clears; bulk Close/Move/Mute/Bookmark delegate to single-tab paths; selection clears when emptied | T-34-03/06 | S + L | S: `node scripts/verify-tab-strip.mjs` checks 8, 9 (+ `--self-test` plants tabid-keyed-selection, second-close-path); L: `LIVE(multi)` | ✅ | S ✅ green 2026-11-01 · L ⏸ deferred to end-of-milestone live pass |
| TAB-07 | Preview shows settled thumbnail or text fallback; 400 ms dwell; never for active visible overlay; below-tab anchor; hides overlay | T-34-04 | S + L | S: `node scripts/verify-tab-strip.mjs` checks 11, 12 (+ `--self-test` plants occlusion-selector-dropped-34-04, preview-anchor-over-page, preview-on-active-tab, live-capture-call); L: `LIVE(preview)` | ✅ | S ✅ green 2026-11-01 · L ⏸ deferred to end-of-milestone live pass |
| TAB-08 | Link drop = TAB-03 drop path (covered there); non-URL text drop searches via pill, never a new tab | T-34-01 | S (partial) + L | S (partial): as TAB-03 (dropTabFailed copy pinned, no kind); behaviour proof is L only: `LIVE(drop)` | ✅ | S ✅ green 2026-11-01 (copy and no-kind only) · L ⏸ deferred to end-of-milestone live pass |
| TAB-09 | `titleChanged` minted chrome-side only; dot on background tabs, cleared on activation; never frame-settable | T-34-07 | S + L | S: `node scripts/verify-tab-strip.mjs` checks 13, 14 (+ `--self-test` plants push-field-missing, push-field-moved, frame-write-titleChanged); L: `LIVE(attention)` | ✅ | S ✅ green 2026-11-01 · L ⏸ deferred to end-of-milestone live pass |
| BMK-07 | Bookmark Tab / Bookmark All Tabs call Phase 33 `bookmarkPage` (the plans' "addBookmark"); no Places write in this phase; failure copy per verb | — | S + L | S: `node scripts/verify-tab-strip.mjs` checks 1, 4, 9 (Bookmark rows present, no kind, bulk Bookmark through the one bookmarkTabs callback) and `--only shell-error-copy-no-internals` (bookmarkTabFailed pinned); L: `LIVE(bookmark-all)`, which reports NOT SCORED (never PASS) until Phase 33's `ChromeStoreClient.bookmarkPage` is merged | ✅ | S ✅ green 2026-11-01 · L ⏸ deferred to end-of-milestone live pass, after the Phase 33 merge |
| D-02 | One strip in Coding, Browsing, Organising (same TabStripWidget and stripTabs reader; visibility per the mode contract `setHidden(modeId !== 'browsing')`); order survives mode switches in-session | — | D + L | D: sidecar DOM measure (`DOM-MEASURE` below); L: `LIVE(modes)` | ✅ | D ⏸ deferred · L ⏸ deferred to end-of-milestone live pass |
| copy | New copy in `chrome-bar-copy.ts`, `{App}` subject, no internal identifier | — | S | `scripts/verify-platform.sh --only shell-error-copy-no-internals` (+ `node scripts/verify-shell-error-copy.mjs --self-test`) | ✅ grows | ✅ green 2026-11-01 |
| boundary | No new `WEB_TAB_ACTION_KINDS`/`STORE_REQUEST_KINDS` (titleChanged is a field on the existing push, not a kind); new `webTab*` arms ↔ union literals; internals catalogued | — | S | `--only internals-boundary`, `--only internals-catalogue`, `--only ng-040-internals-catalogue-lines`, plus `node scripts/verify-web-tab-bridge.mjs --self-test` | ✅ grows | ✅ green 2026-11-01 |
| types | tab-uris and chrome-bar compile | — | S | `--only tab-uris-typecheck`, `--only chrome-bar-typecheck`; `nix develop .#theia --command bash -c 'cd theia && yarn build'` (exit 0, 0 `error TS`) | ✅ | ✅ green 2026-11-01 |
| registry | `tab-strip` + `tab-strip-self-test` in the quick block and `tab-strip-live` + `tab-strip-live-self-test` in the live block, each exactly once, gate before its self-test, no sibling driver | — | S | `node scripts/verify-tab-strip.mjs` check 15 (+ `--self-test` plants registry-row-duplicated, registry-live-row-in-quick, registry-self-test-first, sibling-driver) | ✅ | ✅ green 2026-11-01 |

Every ✅ above was produced on 2026-11-01 in the `workspace/p34` worktree (HEAD after plan 34-05 task 2) by:
`node scripts/verify-tab-strip.mjs` (PASS, checks 1-15), `node scripts/verify-tab-strip.mjs --self-test` (PASS, 24 plants each red naming its drift), `node scripts/verify-web-tab-bridge.mjs --self-test`, `node scripts/verify-shell-error-copy.mjs --self-test`, `node scripts/verify-registry-shape.mjs`, `nix develop .#theia --command bash -c 'cd theia && yarn build'` and `nix develop .#theia --command scripts/verify-platform.sh --quick` (exit 0, run after staging). No L or D row has run: there is no built binary in that lane. A ⏸ row is not green.

`LIVE(<scenarios>)` means, from the repo root of a tree with a current Gecko build (objdir matching the patch stack), one command chain so no live PASS counts on a stale Theia build:

    nix develop .#theia --command bash -c 'cd theia && yarn build' > "${TMPDIR:-/tmp}/pb-34-live-build.log" 2>&1 && node scripts/verify-tab-strip-live.mjs --scenario <scenarios>

`DOM-MEASURE` means the sidecar on :4000 (`cd theia/applications/browser && POWERBROWSER_TOKEN_DISABLE=1 THEIA_CONFIG_DIR="$HOME/.config/powerbrowser" PATH="$PWD/node_modules/.bin:$PWD/../../node_modules/.bin:$PATH" theia start --port 4000 --hostname 127.0.0.1`, inside `nix develop .#theia`), then in each of Browsing, Coding, Organising (and Browsing again) the gsd-browser `browser_eval` read
`JSON.stringify({ mode: document.body.dataset.pbMode, strips: document.querySelectorAll('.pb-tab-strip').length, box: (r => [r.width, r.height])(document.querySelector('.pb-tab-strip').getBoundingClientRect()), chevron: !!document.querySelector('.pb-tab-strip-chevron'), tabs: [...document.querySelectorAll('.pb-tab-strip .pb-tab[data-pb-tab]')].map(n => n.dataset.pbTab) })`.
Pass: one strip node in every mode; a painted row (height 33) in Browsing and zero height in Coding and Organising (the `setHidden(modeId !== 'browsing')` contract); the Browsing `tabs` order identical before and after the round trip; with the window narrowed until the row overflows, `chevron` true, and false again once widened.

The full twelve-scenario suite (`menu, reorder, middle, double, drop, overflow, pin-restore, multi, preview, attention, bookmark-all, modes`), plan 34-05 task 2's chain, to run inside `nix develop .#theia` (so `yarn` is on PATH for the full driver) on a tree with a current Gecko build and Phase 33 merged:

    nix develop .#theia --command bash -c 'cd theia && yarn build' > "${TMPDIR:-/tmp}/pb-34-05-t2-build.log" 2>&1 && node scripts/verify-tab-strip.mjs && node scripts/verify-tab-strip.mjs --self-test && node scripts/verify-tab-strip-live.mjs && node scripts/verify-tab-strip-live.mjs --self-test && node scripts/verify-web-tab-bridge.mjs --self-test && node scripts/verify-shell-error-copy.mjs --self-test && node scripts/verify-registry-shape.mjs && scripts/verify-platform.sh

Plan 34-05 task 1's chain (the two new scenarios alone):

    nix develop .#theia --command bash -c 'cd theia && yarn build' > "${TMPDIR:-/tmp}/pb-34-05-t1-build.log" 2>&1 && node scripts/verify-tab-strip-live.mjs --scenario bookmark-all,modes && node scripts/verify-registry-shape.mjs

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky · ⏸ deferred to the end-of-milestone live pass (not run, not green)*

Threat refs map to `34-RESEARCH.md` § Threat model.

---

## Wave 0 Requirements

- [x] `scripts/verify-tab-strip.mjs` (+ `--self-test`): menu set equality from copy + predicates, CSS layer selectors, occlusion list, no-new-kind guard, codicon presence; grew to 15 checks and 24 planted faults, each going red naming the drift (green 2026-11-01)
- [x] `scripts/verify-tab-strip-live.mjs` (+ `--self-test`): all twelve scenarios written with one plant each and `node --check` clean; not yet run (live pass deferred). Scenarios `menu, reorder, middle, double, drop, overflow, pin-restore, multi, preview, attention, bookmark-all, modes` on `pb-live-probe.mjs`; positive page-side assertions only; ≤4 same-site tabs per session (distinct hosts per session shape)
- [x] Registry rows in `scripts/verify-platform.sh`: `tab-strip`, `tab-strip-self-test` (quick); `tab-strip-live`, `tab-strip-live-self-test` (live); order and exactly-once proven by `verify-tab-strip.mjs` check 15

---

## Manual-Only Verifications

- Drag feel vs Firefox (midpoint rule, auto-scroll edge zones, drag image under cursor) — human judgement on KDE Wayland.
- Preview card readability (thumbnail crop, ellipsis, skeleton shimmer) across light/dark Theia themes.
- Attention dot visibility on muted vs unmuted vs pinned tabs.
- Screen-reader pass: tablist/tab roles, pinned/updated labels, menu keyboard nav, preview `aria-hidden`.
- UAT evidence screenshots via spectacle (prior-phase precedent): tab menu, pinned strip, preview card, attention dot. Deferred to the end-of-milestone live pass with the L rows.

---

## UAT Entry Criteria

Full `scripts/verify-platform.sh` green, both new gates' `--self-test` green, live suite green after the last Theia build, no `web:`-key assumption in any pin/selection path, keys are `GroupModel.keyOf` (duplicates on one URL switch independently).
