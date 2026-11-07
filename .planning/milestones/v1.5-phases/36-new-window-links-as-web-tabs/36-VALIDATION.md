---
phase: "36"
slug: "new-window-links-as-web-tabs"
# status lifecycle: draft (seeded by plan-phase) → validated (set by validate-phase §6)
# audit-milestone §5.5 distinguishes NOT-VALIDATED (draft) from PARTIAL (validated + nyquist_compliant: false) (#2117)
status: draft
nyquist_compliant: false
wave_0_complete: false
created: "2026-10-22"
---

# Phase 36 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.
> Source: `36-RESEARCH.md` § Validation Architecture.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Plain-node derive-and-compare scripts plus BiDi live scripts on `scripts/lib/pb-live-probe.mjs`, one driver: `scripts/verify-platform.sh` |
| **Config file** | The registry inside `scripts/verify-platform.sh` (quick block for `--quick`; the live block for full runs) |
| **Quick run command** | `scripts/verify-platform.sh --quick` |
| **Full suite command** | `scripts/verify-platform.sh` (needs the built binary and the last Theia app build) |
| **Estimated runtime** | ~90 seconds quick; live rows add minutes (one probe-shell session takes about 40 s) |

Proof tiers: **S** is a static gate (`--quick`, with `--self-test`). **L** is the live built shell with `-purgecaches` (`withProbeShell`, `MOZ_PURGE_CACHES=1`), page-realm `probe()`, and served popup pages.

---

## Sampling Rate

- **After every task commit:** `scripts/verify-platform.sh --quick`.
  - Stage new scripts by explicit path first: the brand scan reads `git ls-files`.
  - After any `PowerBrowserAPI.sys.mjs` edit, run `node scripts/verify-ng-040-internals-catalogue-lines.mjs --fix`, then `bash scripts/check-internals-boundary.sh --catalogue`.
- **After every plan wave:** `--quick`, then a Theia build, then `node scripts/verify-new-window-adopt-live.mjs --scenario <that plan's scenarios>`.
- **Before `/gsd-verify-work`:** the full `scripts/verify-platform.sh` and every new `--self-test` must be green.
- **Max feedback latency:** ~90 seconds (quick).

---

## Per-Task Verification Map

This map is at requirement level. Plans bind task IDs to these rows.

| Requirement | Behavior | Threat Ref | Tier | Automated Command | File Exists | Status |
|-------------|----------|------------|------|-------------------|-------------|--------|
| PROMPT-05 shim | Shim QI members == pinned IDL + call-site set; single definition site via the boundary guard | T-36-01, T-36-09 | S | `node scripts/verify-new-window-adopt.mjs` (+ `--self-test`) | W0 | pending |
| PROMPT-05 opener null | Theia-frame opener returns null before creating anything | T-36-03 | S | `node scripts/verify-new-window-adopt.mjs` (+ `--self-test`) | W0 | pending |
| PROMPT-05 pending | Attrs-before-append; remoteType from opener; openWindowInfo set; InFrame no-load + openLinkIn loads; pc-* never stored/shown | T-36-02, T-36-07 | S | `node scripts/verify-new-window-adopt.mjs` (+ `--self-test`) | W0 | pending |
| PROMPT-05 kinds | adoptTab/webTabAdopt/dropAdoptedTab classified, routed, walled, reply vocabulary exact | T-36-04 | S | `node scripts/verify-new-window-adopt.mjs` + `node scripts/verify-web-tab-bridge.mjs` (both + `--self-test`) | W0 / extend | pending |
| GUI-01 transport | Command has no window.open; chrome-bar (excl. command) has no stock escape; GUI-01 rows green unmodified | T-36-10 | S + L | `node scripts/verify-web-tab-bridge.mjs` (+ `--self-test`); `scripts/verify-platform.sh --only gui01-browser-close-does-not-quit` + `--only gui01-command-registered` | re-point | pending |
| PROMPT-05 SC-1 | _blank/window.open becomes a tab directly after opener; shell count 1 | — | L | `node scripts/verify-new-window-adopt-live.mjs --scenario adopt-order` | W0 | pending |
| PROMPT-05 SC-1 | Close adopted tab reselects opener | — | L | `--scenario adopt-order` (reselect leg) | W0 | pending |
| PROMPT-05 SC-2 | Adopted tab has a working window.opener; postMessage round-trip completes | — | L | `--scenario adopt-opener` | W0 | pending |
| PROMPT-05 SC-3 | window.open with popup features opens a popup window, not a tab | — | L | `--scenario adopt-popup` | W0 | pending |
| Fallback | 5 s no-ack opens the URL in the stock window; nothing swallowed (event-waited) | T-36-06 | L | `--scenario adopt-fallback` | W0 | pending |
| Scheme wall | javascript:/moz-extension:/file: refused pre-creation | T-36-02 | S + L | static gate + `--scenario adopt-scheme` | W0 | pending |
| Focus parity | Background adopt keeps opener focus; foreground activates | T-36-08 | L | `--scenario adopt-focus` | W0 | pending |
| Unknown-key sweep | Ack for an unknown pcKey replies unknown-tab and drops the orphan widget | T-36-04 | S + L | static gate + `--scenario adopt-unknown-key` | W0 | pending |
| Copy | No pc-*/wt-*/kind names in adopted-tab titles, tooltips, logs | T-36-05 | S | existing copy gate (no new user-facing strings; Task 36-02/1 eyeball proves it) | existing | pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `scripts/verify-new-window-adopt.mjs` — static adopt gate with `--self-test` (shim set, Theia-opener null path, single site via the boundary guard, pending attrs, split load rule, kind classification, pc-* hygiene)
- [ ] `scripts/verify-new-window-adopt-live.mjs` — live scenarios `adopt-order`, `adopt-opener`, `adopt-popup`, `adopt-focus`, `adopt-fallback`, `adopt-scheme`, `adopt-unknown-key` with `--self-test` plants
- [ ] Registry rows in `scripts/verify-platform.sh` (quick pair + live pair), appended only

*Wave 0 is plan 36-01's Tasks 1-2: the chrome half lands with its static gate in the same plan, and without the gate green, plans 36-02/36-03 have no instrument.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Adopted tab looks like a normal web tab (no pending flash, spinner/title parity) | PROMPT-05 SC-1 | Pixel appearance on KDE Wayland; gates read DOM and strings, not rendering | Open two web tabs, click a `_blank` link in the first; eyeball against `36-UI-SPEC.md` VB-01 |
| Stock window opens and closes cleanly | GUI-01 / SC-3 | Window-manager behaviour; gates assert the contract, not the pixels | Palette command opens stock window; close it; app keeps running |

*If none beyond these: "All other phase behaviors have automated verification."*

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 90s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
