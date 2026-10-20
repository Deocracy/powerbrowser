---
phase: "27"
slug: "groundwork-navigation-buttons-and-page-focus-keys"
# status lifecycle: draft (seeded by plan-phase) → validated (set by validate-phase §6)
# audit-milestone §5.5 distinguishes NOT-VALIDATED (draft) from PARTIAL (validated + nyquist_compliant: false) (#2117)
status: draft
nyquist_compliant: false
wave_0_complete: false
created: "2026-10-20"
---

# Phase 27 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.
> Source: `27-RESEARCH.md` § Validation Architecture.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Plain-node derive-and-compare scripts plus BiDi live scripts, one driver: `scripts/verify-platform.sh` |
| **Config file** | The registry inside `scripts/verify-platform.sh` (`CHECKS=(` for `--quick`; the live block for full runs) |
| **Quick run command** | `scripts/verify-platform.sh --quick` |
| **Full suite command** | `scripts/verify-platform.sh` (needs the built binary and the last Theia build) |
| **Estimated runtime** | ~84 seconds quick; live rows add minutes |

Proof tiers: **S** static gate (`--quick`, with `--self-test`); **D** sidecar DOM measure on :4000 (Theia-frame layout only); **L** live binary run with `-purgecaches`, push recorder, chrome-scope key synthesis.

---

## Sampling Rate

- **After every task commit:** `scripts/verify-platform.sh --quick` (stage new files first for the brand scan)
- **After every plan wave:** `--quick` plus `node scripts/verify-nav-keys-live.mjs` after a Theia build
- **Before `/gsd-verify-work`:** full `scripts/verify-platform.sh` green
- **Max feedback latency:** ~84 seconds (quick)

---

## Per-Task Verification Map

Requirement-level map; plans bind task IDs to these rows.

| Requirement | Behavior | Tier | Automated Command | File Exists | Status |
|-------------|----------|------|-------------------|-------------|--------|
| groundwork | new `webTab*` arms ↔ union literals; push kinds ↔ `onPush` subscriptions; every arm classified (privileged-kind rule) | S | `scripts/verify-platform.sh --only gui02-web-tab-bridge` (+ self-test) | ✅ grows | ⬜ pending |
| groundwork | gBrowser stand-in == derived required − reasoned absences | S | `--only shell-gbrowser-standin` (+ self-test) | ✅ grows | ⬜ pending |
| groundwork | shim globals forbidden outside the boundary; new internals catalogued with correct lines | S | `--only internals-boundary`, `--only internals-catalogue`, `--only ng-040-internals-catalogue-lines` | ✅ grows | ⬜ pending |
| groundwork | `TabUriRegistry` shape unchanged | S | `--only gui04-registry-shape` | ✅ | ⬜ pending |
| groundwork | `webTabActivated` reaches chrome; coalesced state push still drives the pill | L | `node scripts/verify-nav-keys-live.mjs` (activation) | ❌ W0 | ⬜ pending |
| NAV-01 | Stop on the same element while loading; button and Esc stop | L | `verify-nav-keys-live.mjs` (stop) | ❌ W0 | ⬜ pending |
| NAV-02 | Shift+click, Ctrl+Shift+R, Ctrl+F5 bypass cache (server sees no-cache) | L | `verify-nav-keys-live.mjs` (hard-reload) | ❌ W0 | ⬜ pending |
| NAV-03 | contextmenu / 500 ms hold opens history `.lm-Menu`; entry navigates | L + D | `verify-nav-keys-live.mjs` (history) | ❌ W0 | ⬜ pending |
| NAV-04 | Home hidden by default; setting shows it live; click and Alt+Home load home; bad value shows failure row | L + D | `verify-nav-keys-live.mjs` (home) | ❌ W0 | ⬜ pending |
| NAV-05 | tooltip text equals derived table; tooltip never covers the page | S + L | `node scripts/verify-shortcut-relay.mjs` (+ self-test); live (tooltips) | ❌ W0 | ⬜ pending |
| NAV-06 | middle-click Back/Forward/Reload opens background tab; link drop opens tab; `javascript:` refused | L | `verify-nav-keys-live.mjs` (middle-click, drop) | ❌ W0 | ⬜ pending |
| KEY-01 | page-focused Ctrl+T/W/R/F5/Alt+←/→ do the Firefox action | L | `verify-nav-keys-live.mjs` (page-keys) | ❌ W0 | ⬜ pending |
| KEY-02 | Alt+D/Ctrl+L/F6/Shift+F6 → pill; F6 in pill → page | L | `verify-nav-keys-live.mjs` (focus-keys) | ❌ W0 | ⬜ pending |
| KEY-03 | Ctrl+Tab family and Alt+1..9 follow visible order; wrap; focus in page | L | `verify-nav-keys-live.mjs` (tab-keys) | ❌ W0 | ⬜ pending |
| KEY-04 | Theia-focused clashing keys reach Theia, no `shortcut` push; no row binds F11/Ctrl+P/Ctrl+K | S + L | `verify-shortcut-relay.mjs`; live (theia-keeps-keys) | ❌ W0 | ⬜ pending |
| KEY-05 | AppCommand Back/Forward over a page navigates | L + manual | `verify-nav-keys-live.mjs` (mouse-buttons) | ❌ W0 | ⬜ pending |
| copy | new copy has no internal identifier and no brand literal | S | `--only shell-error-copy-no-internals` | ✅ grows | ⬜ pending |
| types | tab-uris and chrome-bar compile | S | `--only tab-uris-typecheck`; new `chrome-bar-typecheck` row | ✅ / ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `scripts/lib/pb-live-probe.mjs` — `-purgecaches` launch option, push recorder, page-focus probe, overlay-context lookup
- [ ] `scripts/verify-shortcut-relay.mjs` + `--self-test` — derived key table set equality, reserved ⊆ upstream reserved ∪ reasoned map, no F11/Ctrl+P/Ctrl+K rows, every page row created disabled
- [ ] `scripts/verify-nav-keys-live.mjs` + `--self-test` — scenarios above; plants: removed relay row, key enabled while Theia focused, Stop as a second element
- [ ] Registry rows in `scripts/verify-platform.sh`: `shortcut-relay`, `shortcut-relay-self-test` (quick); `nav-keys-live`, `nav-keys-live-self-test` (live); `chrome-bar-typecheck` (quick)

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Real keyboard and mouse buttons 4/5 on KDE Wayland | KEY-01..05 | Synthesized chrome-scope events are evidence, not UAT (PROJECT.md) | In the running binary, focus a web page and press each key in the KEY table; press mouse back/forward over the page |
| Tooltip look and long-press feel | NAV-03, NAV-05 | Visual and timing quality | KWin raise + `spectacle`; hold Back 500 ms |

Deferred to Chris's own end-of-milestone checks per the standing instruction in STATE.md.

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 120s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
