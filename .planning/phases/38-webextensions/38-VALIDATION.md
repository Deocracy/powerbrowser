---
phase: "38"
slug: "webextensions"
# status lifecycle: draft (seeded by plan-phase) → validated (set by validate-phase §6)
# audit-milestone §5.5 distinguishes NOT-VALIDATED (draft) from PARTIAL (validated + nyquist_compliant: false) (#2117)
status: draft
nyquist_compliant: false
wave_0_complete: false
created: "2026-10-22"
---

# Phase 38 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.
> Source: `38-RESEARCH.md` § Validation Architecture.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Plain-node derive-and-compare scripts plus BiDi live scripts on `scripts/lib/pb-live-probe.mjs`, one driver: `scripts/verify-platform.sh` |
| **Config file** | The registry inside `scripts/verify-platform.sh` (`CHECKS=(` for `--quick`; the live block for full runs) |
| **Quick run command** | `scripts/verify-platform.sh --quick` |
| **Full suite command** | `scripts/verify-platform.sh` (needs the built binary, the last Theia app build, AMO reachability for the EXT-09 row) |
| **Estimated runtime** | ~90 seconds quick; live rows add minutes (one probe-shell session ≈ 40 s per scenario file) |

Proof tiers: **S** static gate (`--quick`, with `--self-test`); **L** live binary run
with `-purgecaches` (`withProbeShell`, `MOZ_PURGE_CACHES=1`, page-realm `probe()`,
push recorder, chrome-scope evaluate); **A** allowlist/registry consistency (static,
same commit as the rows it covers).

---

## Sampling Rate

- **After every task commit:** `scripts/verify-platform.sh --quick` (stage new files
  first for the brand scan — it reads `git ls-files`; after any
  `PowerBrowserAPI.sys.mjs` edit run
  `node scripts/verify-ng-040-internals-catalogue-lines.mjs --fix`, then
  `bash scripts/check-internals-boundary.sh --catalogue`, then append
  INTERNAL-APIS.md rows).
- **After every plan wave:** `--quick` plus a Theia build, then the live file that
  plan grew (`buttons` after 38-02 Task 1; `popup-action,manage` after Tasks 2–3;
  `content` after 38-03; `sidebar,tab-pages,commands` after 38-04;
  `amo-install,fixtures` after 38-05) and the wave-close
  regression set below.
- **Before `/gsd-verify-work`:** full `scripts/verify-platform.sh` green and both
  new live files' `--self-test` green.
- **Max feedback latency:** ~90 seconds (quick).

---

## Per-Task Verification Map

Requirement-level map; plans bind task IDs to these rows.

| Requirement | Behavior | Threat Ref | Tier | Automated Command | File Exists | Status |
|-------------|----------|------------|------|-------------------|-------------|--------|
| groundwork W0 | `extensionAction` push kind ↔ `onPush` subscription; new arms ↔ request union; every new arm classified (privileged-kind rule) | T-38-02 | S | `verify-extension-actions.mjs` (+ `--self-test`); `verify-web-tab-bridge.mjs` (+ `--self-test`) grows | ❌ W0 | ⬜ pending |
| groundwork W0 | No `triggerAction(shell)` / `triggerAction(window)` string; only `triggerClickOrPopup(selectedTab)`; no new `messagemanagergroup` | T-38-01 | S | `verify-extension-actions.mjs` (+ `--self-test` plant) | ❌ W0 | ⬜ pending |
| groundwork W0 | New boundary touchpoints catalogued, lines correct; shim-member policy holds | T-38-02 | S | `--only internals-boundary`, `--only internals-catalogue`, `--only ng-040-internals-catalogue-lines` | ✅ grows | ⬜ pending |
| EXT-06 | Buttons + puzzle rows equal the installed-fixture-derived set (both directions); badge text/icon/enabled read chrome-side; pinned set persists | T-38-03 | S + L | `verify-extension-actions.mjs` (+ presence assertion from 38-01 Task 2); `verify-extension-actions-live.mjs --scenario buttons` | ❌ W0 | ⬜ pending |
| EXT-06 | Page-action pill icon shows/hides per tab via `isShownForTab(selectedTab)`; click runs `triggerClickOrPopup` on the selected tab | T-38-04 | S + L | relay derivation in `verify-extension-actions.mjs`; `--scenario page-action` (38-03) | ❌ W0 | ⬜ pending |
| EXT-06 | Manage opens Add-ons Manager via enum; Remove uninstalls behind confirm; Pin toggles the persisted set | T-38-07 | L | `verify-extension-actions-live.mjs --scenario manage` | ❌ W0 | ⬜ pending |
| EXT-07 | Theia click opens the popup / runs the action IN the active overlay (wrong-page plant runs it in the stock tab and must go red) | T-38-01 | L | `verify-extension-actions-live.mjs --scenario popup-action` | ❌ W0 | ⬜ pending |
| EXT-07 | Popup closes on Esc / focus-out / tab switch; focus returns to the pill | — | L | `verify-extension-actions-live.mjs --scenario popup-action` | ❌ W0 | ⬜ pending |
| EXT-08 | `sender.tab` set; `sendMessage(tabId)` reaches the page; `show_matches` page-action enables per tab | T-38-04 | L | `verify-extension-actions-live.mjs --scenario content` | ❌ W0 | ⬜ pending |
| EXT-08 | `contextMenus` entry appears in the page menu relay and runs on the web tab, not the IDE | T-38-04 | S + L | relay derivation in `verify-extension-actions.mjs` (38-03 T3); live: 35-05 `verify-page-furniture-live.mjs --scenario extension-entry` (cited, re-run at the 38-05 phase close) | ❌ W0 | ⬜ pending |
| EXT-09 | AMO hosts in allowlist + named in ROADMAP.md and REQUIREMENTS.md in the same change | T-38-05 | A | `--only allowlist-doc-consistency` (+ self-test); `verify-webextensions.mjs` | ✅ grows | ⬜ pending |
| EXT-09 | Stock install prompt appears (page-side), accept installs, the extension then works | T-38-05 | L | `verify-extension-amo-live.mjs --scenario amo-install` (or scenarios in the actions live file) | ❌ W0 | ⬜ pending |
| EXT-10 | uBlock Origin blocks (count > 0); password-manager fills a harness-local login form with runtime-invented throwaway credentials (no vault account, no committed secret — D-09); Dark Reader rewrites CSS — positive page-side assertions only | T-38-06 | L | `verify-extension-amo-live.mjs --scenario fixtures` | ❌ W0 | ⬜ pending |
| B5-ruling | Sidebar page as Theia side-panel view; tab-opened extension pages in the stock window (`moz-extension://` still refused in web tabs); commands shortcuts fire with page focus, Theia keys otherwise | — | S + L | `sidebar` + `tab-pages` + `commands` scenarios in the actions live file (38-04) | ❌ W0 | ⬜ pending |
| SC1 regression | `tabs.query`, tab events, active tab report web tabs (31.1/EXT-05 capability) | — | L | 31.1 live scenarios re-run in the 38-05 phase close (Task 3) | ❌ W0 | ⬜ pending |
| copy | New strings in `CHROME_BAR_COPY`; no internal id in copy; `{App}` subject | — | S | `--only shell-error-copy-no-internals` (+ `--self-test`) grows | ✅ grows | ⬜ pending |
| types | chrome-bar (incl. `extensions/`) and tab-uris compile | — | S | `--only chrome-bar-typecheck`, `--only tab-uris-typecheck` | ✅ grows | ⬜ pending |
| regression | Zero-overlay install/restart; IDE-focus active-tab; GUI-01 row; token-cookie planted clear; `moz-extension://` create refused | T-38-01/04/08 | S + L | 31.1 gate re-run + `verify-extension-actions-live.mjs --scenario regression` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `scripts/verify-extension-actions.mjs` (+ `--self-test`) — derived set-equality
  over installed fixtures; `triggerClickOrPopup(selectedTab)`-only assertion with a
  `triggerAction(shell)` plant; no-new-`messagemanagergroup` assertion; kind
  classification; count of sources read printed.
- [ ] `scripts/verify-extension-actions-live.mjs` (+ `--self-test`, `PLANTS` table) —
  `buttons`, `popup-action`, `content`, `manage`, `regression` scenarios; every plant
  applies and goes red naming its expected text.
- [ ] `scripts/verify-extension-amo-live.mjs` (or AMO scenarios in the file above) —
  `amo-install`, `fixtures` scenarios with positive page-side assertions.
- [ ] B5-ruling scenarios (`sidebar`, `tab-pages`, `commands` in
  `scripts/verify-extension-actions-live.mjs`, 38-04) with plants that each go red
  naming the drift, every absence assertion paired with its same-session positive
  control recorded by the same recorder.
- [ ] Registry rows in `scripts/verify-platform.sh`: `extension-actions`,
  `extension-actions-self-test` (quick); `extension-actions-live`,
  `extension-actions-live-self-test`, `extension-amo-live` (live). One row per check.
- [ ] `powerbrowser/INTERNAL-APIS.md` appended rows for every new boundary touchpoint
  (same commit as the code).

*If none: "Existing infrastructure covers all phase requirements." — not the case
here; the three files above are Wave 0.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Button/menu/badge pixel rendering on KDE Wayland; popup anchoring against the bar | EXT-06, EXT-07 | Gates read DOM and strings, not rendering | Launch the shell, install two fixtures, pin/unpin, open a popup; screenshot with the KWin raise and spectacle; compare against 38-UI-SPEC geometry |
| Real AMO install click-through and permission grant | EXT-09 | Human consent surface; network outside the harness | In the running binary, install one fixture from AMO, accept the stock prompt, confirm it works |
| Real keyboard/pointer on popup (Esc, focus-out, second click) | EXT-07 | Synthesized chrome-scope events are evidence, not UAT | Focus variations over popup open/close; confirm focus returns to the pill |

Deferred to Chris's own end-of-milestone checks per the standing instruction in STATE.md.

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 90s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
