---
phase: "34"
slug: "tab-strip"
status: draft
nyquist_compliant: false
wave_0_complete: false
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
| TAB-01 | Menu lists exactly the ROADMAP contract items; each disabled exactly when its predicate says so; copy from `chrome-bar-copy.ts` | T-34-06 | S + L | `node scripts/verify-tab-strip.mjs` (+ `--self-test`); live `--scenario menu` | ❌ W1 | ⬜ pending |
| TAB-01 Mute | Mute/Unmute calls Phase 32 `webTabMute`; label follows `soundPlaying`; no audio code in this phase | T-34-06 | S + L | `verify-tab-strip.mjs` (no-mute-impl plant); live `--scenario menu` | ❌ W1 | ⬜ pending |
| TAB-02 | Drag reorders home-pane `TabBar` order; drop index = midpoint rule; no chrome kind; survives mode switch in-session | T-34-02 | S + L | `verify-tab-strip.mjs` (no-new-kind plant); live `--scenario reorder` | ❌ W2 | ⬜ pending |
| TAB-03 | Middle-click closes (auxclick/mousedown button 1 consumed per upstream EventStateManager.cpp:6375-6407; seeded contenteditable input/paste detector silent after a caught positive control) | T-34-01 | L | live `--scenario middle,double,drop` | ❌ N2 | ⬜ pending |
| TAB-04 | Overflow scrolls; chevron iff `scrollWidth > clientWidth`; List All mirrors strip order pinned-first; pick activates + scrolls into view | — | D + L | live `--scenario overflow` (+ DOM measure) | ❌ W2 | ⬜ pending |
| TAB-05 | Pinned tabs icon-only, sticky-left, excluded from Close Others/Left/Right + bulk close; pins restore after restart pinned-first order-kept with reopened rowKey equal to the stored key (W1: `WebTabOpenHandler.openUrl(url, rowKey)` → `createWidget` → `WebTabOptions.key`, web-tab.ts:826-852) | T-34-05 | S + L | `verify-tab-strip.mjs` (pin-store plant); live `--scenario pin-restore` | ❌ W3 | ⬜ pending |
| TAB-06 | Ctrl/Cmd-toggle, Shift-range, Esc/click clears; bulk Close/Move/Mute/Bookmark delegate to single-tab paths; selection clears when emptied | T-34-03/06 | S + L | `verify-tab-strip.mjs`; live `--scenario multi` | ❌ W3 | ⬜ pending |
| TAB-07 | Preview shows settled thumbnail or text fallback; 400 ms dwell; never for active visible overlay; below-tab anchor; hides overlay | T-34-04 | S + L | `verify-tab-strip.mjs` (occlusion plant); live `--scenario preview` | ❌ W4 | ⬜ pending |
| TAB-08 | Link drop = TAB-03 drop path (covered there); non-URL text drop searches via pill, never a new tab | T-34-01 | L | live `--scenario drop` | ❌ W2 | ⬜ pending |
| TAB-09 | `titleChanged` minted chrome-side only; dot on background tabs, cleared on activation; never frame-settable | T-34-07 | S + L | `verify-tab-strip.mjs` (no-frame-write plant); live `--scenario attention` | ❌ W4 | ⬜ pending |
| BMK-07 | Bookmark Tab / Bookmark All Tabs call Phase 33 `addBookmark`; no Places write in this phase; failure copy per verb | — | S + L | `verify-tab-strip.mjs`; live `--scenario bookmark-all` | ❌ W1 | ⬜ pending |
| D-02 | Strip renders in Coding, Browsing, Organising; order survives mode switches in-session | — | D + L | live `--scenario modes` (+ DOM measure) | ❌ W5 | ⬜ pending |
| copy | New copy in `chrome-bar-copy.ts`, `{App}` subject, no internal identifier | — | S | `--only shell-error-copy-no-internals` | ✅ grows | ⬜ pending |
| boundary | No new `WEB_TAB_ACTION_KINDS`/`STORE_REQUEST_KINDS` (titleChanged is a field on the existing push, not a kind); new `webTab*` arms ↔ union literals; internals catalogued | — | S | `--only internals-boundary`, `--only internals-catalogue`, `--only ng-040-internals-catalogue-lines` | ✅ grows | ⬜ pending |
| types | tab-uris and chrome-bar compile | — | S | `--only tab-uris-typecheck`, `--only chrome-bar-typecheck` | ✅ | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

Threat refs map to `34-RESEARCH.md` § Threat model.

---

## Wave 0 Requirements

- [ ] `scripts/verify-tab-strip.mjs` (+ `--self-test`): menu set equality from copy + predicates, CSS layer selectors, occlusion list, no-new-kind guard, codicon presence; 5 planted faults each going red naming the drift
- [ ] `scripts/verify-tab-strip-live.mjs` (+ `--self-test`): scenarios `menu, reorder, middle, double, drop, overflow, pin-restore, multi, preview, attention, bookmark-all, modes` on `pb-live-probe.mjs`; positive page-side assertions only; ≤4 same-site tabs per session (distinct hosts per session shape)
- [ ] Registry rows in `scripts/verify-platform.sh`: `tab-strip`, `tab-strip-self-test` (quick); `tab-strip-live`, `tab-strip-live-self-test` (live)

---

## Manual-Only Verifications

- Drag feel vs Firefox (midpoint rule, auto-scroll edge zones, drag image under cursor) — human judgement on KDE Wayland.
- Preview card readability (thumbnail crop, ellipsis, skeleton shimmer) across light/dark Theia themes.
- Attention dot visibility on muted vs unmuted vs pinned tabs.
- Screen-reader pass: tablist/tab roles, pinned/updated labels, menu keyboard nav, preview `aria-hidden`.
- UAT evidence screenshots via spectacle (prior-phase precedent).

---

## UAT Entry Criteria

Full `scripts/verify-platform.sh` green, both new gates' `--self-test` green, live suite green after the last Theia build, no `web:`-key assumption in any pin/selection path, keys are `GroupModel.keyOf` (duplicates on one URL switch independently).
