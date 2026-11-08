---
phase: "37"
slug: "permission-prompts-and-dialogs"
status: draft
nyquist_compliant: false
wave_0_complete: false
created: "2026-10-22"
---

# Phase 37 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.
> Source: `37-RESEARCH.md` § Validation Architecture.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Plain-node derive-and-compare scripts plus BiDi live scripts, one driver: `scripts/verify-platform.sh` |
| **Config file** | Registry inside `scripts/verify-platform.sh` (`CHECKS=(` for `--quick`; live block for full runs) |
| **Quick run command** | `scripts/verify-platform.sh --quick` |
| **Full suite command** | `scripts/verify-platform.sh` (needs built binary and last Theia build) |
| **Estimated runtime** | ~90 seconds quick; live rows add minutes |

Tiers: **S** static gate (`--quick`, `--self-test`); **L** live BiDi probe (`scripts/lib/pb-live-probe.mjs`, `-purgecaches`, push recorder); **M** manual KWin screenshots for BiDi-blind XUL.

---

## Sampling Rate

- **After every task commit:** `scripts/verify-platform.sh --quick` (stage new files first for the brand scan)
- **After every plan wave:** `--quick` plus `node scripts/verify-prompts-live.mjs` after a Theia build
- **Before `/gsd-verify-work`:** full `scripts/verify-platform.sh` green
- **Max feedback latency:** ~90 seconds (quick)

---

## Per-Task Verification Map

| Requirement | Behavior | Tier | Automated Command | File Exists | Status |
|-------------|----------|------|-------------------|-------------|--------|
| PROMPT-01 | permission doorhanger asks; remembered per site; background waits | S + L | `scripts/verify-platform.sh --only permission-prompts` + `node scripts/verify-prompts-live.mjs --scenario permission|remember|background-queue` | ❌ W0 | ⬜ pending |
| PROMPT-02 | sharing indicator while camera/mic/screen live | S + L | `--only permission-prompts` + live `--scenario sharing` | ❌ W0 | ⬜ pending |
| PROMPT-03 | dialogs answerable, IDE usable, stoppable | S + L + checkpoint:decision | `--only permission-prompts` + probe-1 live run writing `prompt-probe-verdict.json` + live `--scenario dialog|stop-repeat` | ❌ W0 | ⬜ pending |
| PROMPT-07 | password save/update offered | S + L | `--only permission-prompts` + live `--scenario password-save|password-update` | ❌ W0 | ⬜ pending |
| PROMPT-09 | per-tab bars appear; Allow opens as web tab | S + L | `--only permission-prompts` + live `--scenario popup-block|hung-script|protocol-handler` | ❌ W0 | ⬜ pending |
| groundwork | furniture via one installer; no frame-callable allow; stand-in deltas derived | S | `--only shell-furniture`, `--only web-tab-bridge`, `--only internals-boundary`, `--only shell-gbrowser-standin` (+ self-tests) | ✅ grows | ⬜ pending |
| copy | new copy in CHROME_BAR_COPY, appSubject, no internals | S | `--only shell-error-copy-no-internals` (+ self-test) | ✅ grows | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `scripts/verify-permission-prompts.mjs` — derived S gate (furniture ids, PopupNotifications construction, SitePermissions keyed by own principal, forbidden `allow` kinds, bar-outside-blocking-layer, deliberately-absent `getTabDialogBox` unless relay) + `--self-test` plants (each names drift)
- [ ] `scripts/verify-prompts-live.mjs` — L scenarios above (page-side outcomes only: permission state, opener existence, geometry delta, SitePermissions read-back) + `--self-test` plants
- [ ] Registry rows in `scripts/verify-platform.sh`: `permission-prompts`, `permission-prompts-self-test` (quick); `prompts-live`, `prompts-live-self-test` (live)
- [ ] No `.planning/` path literal in any script; no absent-log-line assertions without positive control in same session

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Doorhanger anchored at identity box, stock strings | PROMPT-01 | BiDi cannot see XUL panels (Pitfall 15) | Open permission page, KWin screenshot; panel floats over bar rect, page fully visible |
| Stock dialog leaves IDE usable on KDE Wayland | PROMPT-03 | Usability is UAT, not scriptable (probe 1) | Trigger alert/confirm/auth; edit code while dialog open; screenshot; if blocked → relay + Needs Chris |
| Sharing indicator look + tooltip | PROMPT-02 | Visual quality | Screenshot bar with camera live; tooltip names kind |
| Password doorhanger + notification bars look | PROMPT-07/09 | Visual quality | Screenshots of save/update, blocked-popup/hung-script/handler bars; bar shrinks page (no cover) |

KWin screenshots are taken AT EXECUTION TIME by the executor (probe 1 is a live run under the built binary). Planning output performs no live runs; any standing rule claiming otherwise is removed from the 37 plans.

---

## Threat Model

| Boundary | Description |
|----------|-------------|
| page → chrome | untrusted page triggers stock actors; chrome keys by overlay identity + own principal |
| chrome → Theia | display-only fields + token; no callbacks/principals/URLs cross |
| Theia → chrome | token + fixed-enum action; no URL/origin/principal accepted |

| Threat ID | Category | Component | Severity | Disposition | Mitigation Plan |
|-----------|----------|-----------|----------|-------------|-----------------|
| T-37-V-01 | Spoofing | gate positive controls | medium | mitigate | every live scenario has a plant that must go red naming expected text; no absent-line assertion without same-session positive |
| T-37-V-02 | Tampering | gate expectation lists | medium | mitigate | derive-from-tree-and-compare as sets; hand-kept lists fail plan-check |
| T-37-V-03 | Info disclosure | screenshots/logs | low | mitigate | screenshots show chrome only; logs carry kind+class, never URLs/titles/credentials |

---

## Must_Haves

- truths: ["Every requirement maps to an S row and an L scenario above", "Wave 0 gates exist before plan 37-02 runs", "BiDi-blind XUL is proven by page-side outcomes plus KWin screenshots, never BiDi DOM reads"]
- artifacts: [`37-VALIDATION.md` this contract, `scripts/verify-permission-prompts.mjs`, `scripts/verify-prompts-live.mjs`]

---

## Verify

- `scripts/verify-platform.sh --quick` — green after every task commit.
- `node scripts/verify-permission-prompts.mjs --self-test` — every plant goes red naming drift.
- `node scripts/verify-prompts-live.mjs --self-test` — every plant goes red.
- fails_when: any `--only` row reds; a gate asserts BiDi DOM on `#notification-popup`; a new check lacks a registry row or `--self-test`; feedback latency exceeds 120 s across 3 tasks.

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 120s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
