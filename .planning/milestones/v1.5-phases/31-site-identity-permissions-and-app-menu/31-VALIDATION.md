---
phase: "31"
slug: site-identity-permissions-and-app-menu
status: draft
nyquist_compliant: false
wave_0_complete: false
created: "2026-10-22"
---

# Phase 31 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | node (`.mjs` gates) + BiDi live probe (`scripts/lib/pb-live-probe.mjs`) |
| **Config file** | `scripts/verify-platform.sh` (registry; `--quick`, `--only`, `--gate`) |
| **Quick run command** | `scripts/verify-platform.sh --quick` |
| **Full suite command** | `scripts/verify-platform.sh --gate` (plus live gates after a Theia build) |
| **Estimated runtime** | ~60 seconds (`--quick`) |

---

## Sampling Rate

- **After every task commit:** Run `scripts/verify-platform.sh --quick`
- **After every plan wave:** Run `scripts/verify-platform.sh --gate`
- **Before `/gsd-verify-work`:** Full suite must be green
- **Max feedback latency:** 90 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 31-01-01 | 01 | 1 | SITE-01, SITE-02, SITE-03 | T-31-01 | pushed enum selects icon; typed text never feeds lock; reset on navigation | static | `node scripts/verify-site-identity.mjs` | ❌ W0 | ⬜ pending |
| 31-01-02 | 01 | 1 | SITE-01..03 | T-31-01 | mask widened; decode recipe matches upstream flags | static | `node scripts/verify-site-identity.mjs --self-test` | ❌ W0 | ⬜ pending |
| 31-02-01 | 02 | 2 | SITE-04, SITE-05, SITE-06 | T-31-02 | panel opens; principal-keyed reads/writes; icons appear | live | `node scripts/verify-site-identity-live.mjs --scenario identity-lock,site-panel` | ❌ W0 | ⬜ pending |
| 31-02-02 | 02 | 2 | SITE-05 | T-31-05 | no sender-supplied origin write path | static | `node scripts/verify-site-identity.mjs` | ❌ W0 | ⬜ pending |
| 31-03-01 | 03 | 3 | SITE-07 | T-31-03 | clear removes site data; IDE session survives incl. localhost | live | `node scripts/verify-site-identity-live.mjs --scenario clear-data` | ❌ W0 | ⬜ pending |
| 31-03-02 | 03 | 3 | SITE-08 | T-31-04 | shield count shown; exception toggles per site | live | `node scripts/verify-site-identity-live.mjs --scenario shield` | ❌ W0 | ⬜ pending |
| 31-04-01 | 04 | 4 | MENU-01, MENU-02 | T-31-06 | order = Firefox order filtered to landed; stock pages open stock-side | static+live | `node scripts/verify-site-identity.mjs`; `--scenario app-menu` | ❌ W0 | ⬜ pending |
| 31-04-02 | 04 | 4 | MENU-04 | T-31-06 | Ctrl+Q + Quit row quit via existing path | live | `node scripts/verify-site-identity-live.mjs --scenario app-menu` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

Threat refs:

- **T-31-01:** stale/spoofed lock (typed text, cross-navigation state).
- **T-31-02:** panel acts on the wrong site (principal confusion).
- **T-31-03:** clear signs the IDE out (token cookie cleared).
- **T-31-04:** shield exception leaks to other sites.
- **T-31-05:** sender-supplied origin reaches a write.
- **T-31-06:** menu opens unlanded features or a stock page loads in a web tab.
- **T-31-SC:** supply-chain (no new package in any plan) — accept.

---

## Wave 0 Requirements

- [ ] `scripts/verify-site-identity.mjs` (+ `--self-test`): pure-table import, derived set-equality (SecurityState, PERMISSION_IDS from upstream `listPermissions()`/gPermissions keys `:326`+`:863-1024` parsed at check time, STOCK_PAGES, menu order), absence assertions (typed-text lock, `openStockTab('about:…')`, `data.origin` writes), codicon Codicon check vs `dist/codicon.css`, INTERNAL-APIS.md row check, KIND_CLASSES + STORE_KIND_CLASSES (`quitRequest`/`openStockPage`) extension, autoplay-media multichoice states, plants red-with-text
- [ ] `scripts/verify-site-identity-live.mjs` (+ `--self-test`): scenarios `identity-lock`, `site-panel`, `clear-data` (planted clear), `shield`, `app-menu` (+ Ctrl+Q/Quit), each with a `PLANTS` fault
- [ ] `scripts/verify-platform.sh`: quick-block rows `site-identity`, `site-identity-self-test`, `site-identity-live`, `site-identity-live-self-test` (registered by plans 01-03)

### Sampling map (which scenarios run after which commits)

| After | Run | Budget |
|-------|-----|--------|
| every task commit | `scripts/verify-platform.sh --quick` | ~60s, no build |
| 31-01 tasks | `verify-site-identity.mjs` + `--self-test` | static only |
| 31-02/03/04 tracer tasks | matching live `--scenario` after a Theia build | ≤4 served-origin tabs, `MOZ_PURGE_CACHES=1` |
| phase close | full live run (all five scenarios) + both `--self-test` | flakes recorded in SUMMARY |

Positive-control rule: no absence assertion without a positive control in the same session by the same recorder (a gate that only checks absence can never be shown to go red).

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Identity/panel/menu pixel appearance vs 31-UI-SPEC on KDE Wayland | SITE-01..08, MENU-01/02/04 | Gates read DOM/strings, not rendering | Launch shell, visit https + http + mixed fixtures, open panel + hamburger, screenshot (memory: screenshot-pb-on-kde-wayland), compare with UI-SPEC ASCII mockups |
| Punycode visual vs Firefox chrome for a spoofable IDN | SITE-03 | Glyph/confusion judgement for Chris | Open the IDN fixture beside stock Firefox, compare display host |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 90s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
