---
phase: "35"
slug: "shell-furniture-and-page-context-menu"
status: draft
nyquist_compliant: false
wave_0_complete: false
created: "2026-10-22"
---

# Phase 35 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.
> Source: `35-RESEARCH.md` § Validation Architecture.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Plain-node derive-and-compare scripts plus BiDi live scripts on `scripts/lib/pb-live-probe.mjs`, one driver: `scripts/verify-platform.sh` |
| **Config file** | The registry inside `scripts/verify-platform.sh` (quick block for `--quick`; the live block for full runs) |
| **Quick run command** | `scripts/verify-platform.sh --quick` |
| **Full suite command** | `scripts/verify-platform.sh` (needs the built binary, the last Theia build) |
| **Estimated runtime** | ~90 seconds quick; live rows add minutes (one probe-shell session ~40 s) |

Proof tiers: **S** static gate (`--quick`, with `--self-test`); **D** sidecar DOM measure on :4000 (Theia-frame layout only); **L** live binary run with `-purgecaches`, push recorder, chrome-scope evaluate and key synthesis.

---

## Sampling Rate

- **After every task commit:** `scripts/verify-platform.sh --quick` (stage new files first for the brand scan; after any `PowerBrowserAPI.sys.mjs` edit run `node scripts/verify-ng-040-internals-catalogue-lines.mjs --fix` then `bash scripts/check-internals-boundary.sh --catalogue`).
- **After every plan wave:** `--quick`, then a Theia build (`nix develop .#theia --command bash -c 'cd theia && yarn build'`), then `node scripts/verify-page-furniture-live.mjs --scenario <that plan's scenarios>` and `--self-test`. No Gecko rebuild: the binary reads `powerbrowser/shell/*` through symlinks.
- **Before `/gsd-verify-work`:** full `scripts/verify-platform.sh` green.
- **Max feedback latency:** ~90 seconds (quick).

---

## Per-Task Verification Map

Revised 2026-10-22 (planner revision): seven sequential plans (35-CONTEXT.md D-18). "Live" rows run
after the plan's Theia build; the built binary needs no Gecko rebuild (symlinked shell files).

| Task | Requirement | Behavior | Tier | Automated Command | File Exists | Status |
|------|-------------|----------|------|-------------------|-------------|--------|
| 35-01-T1 | groundwork (T-27-11) | stand-in call sites derived from both actor registries + directories; addTrustedTab, getPanel reasoned; component-parent plant red | S | `node scripts/verify-shell-gbrowser-standin.mjs --self-test` | ✅ grows | ⬜ pending |
| 35-01-T2 | groundwork (D-17) | shim globals compared with upstream calls (IDL for XULBrowserWindow); PointerlockFsWarning forbidden outside the boundary | S | `--only shell-gbrowser-standin-self-test`, `--only internals-boundary-self-test` | ✅ grows | ⬜ pending |
| 35-02-T1 | PROMPT-08 | XULBrowserWindow on the AppWindow; remoteBrowserTooltip; overLink pushed and subscribed | S | `--only shell-gbrowser-standin`, `--only gui02-web-tab-bridge`, `--only internals-catalogue` | ✅ grows | ⬜ pending |
| 35-02-T2 | groundwork | furniture ids, upstream parity, installer, policy; overLink bridge plant | S | `--only shell-furniture`, `--only shell-furniture-self-test` | ❌ W0 (35-02 creates) | ⬜ pending |
| 35-02-T3 | PROMPT-08 | tooltip and in-bar status in a page; nothing over the IDE | L | `verify-page-furniture-live.mjs --scenario tooltip-status,theia-hover-silent` | ❌ W0 (35-02 creates) | ⬜ pending |
| 35-03-T1 | PROMPT-04 | nsContextMenu shim + stub; Copy Link end to end; webTabContextMenuAction privileged with its fence | S | `--only gui02-web-tab-bridge`, `--only shell-gbrowser-standin`, `--only shell-furniture` | ✅ grows | ⬜ pending |
| 35-03-T2 | PROMPT-04 | 35-03 rows, open grants with referrer, refusal row; row ids and strings derived from upstream | S | `--only shell-furniture-self-test`, `--only shell-error-copy-no-internals` | ✅ grows | ⬜ pending |
| 35-03-T3 | PROMPT-04 | rows work page-side; IDE keeps its menu; hidden tab never opens one; timing line | L | `--scenario context-menu,menu-not-in-ide,background-menu` | ✅ grows | ⬜ pending |
| 35-04-T1 | PROMPT-04 | Inspect via Phase 32's devtools route, node selected | S | `--only shell-furniture` | ✅ grows | ⬜ pending |
| 35-04-T2 | PROMPT-04 | edit rows (Phase 32 edit), Copy Image, Bookmark Page, Save Page As, view source, saves, spelling | S | `--only shell-furniture-self-test`, `node scripts/verify-page-tools-edit.mjs --self-test` | ✅ grows | ⬜ pending |
| 35-04-T3 | PROMPT-04 | those rows work live | L | `--scenario menu-page-tools,menu-edit,menu-spelling,menu-save` | ✅ grows | ⬜ pending |
| 35-05-T1 | PROMPT-04 (EXT-08 carriage) | on-build-contextmenu subject = upstream's; extension rows forwarded and cleaned up | S | `--only shell-furniture-self-test` | ✅ grows | ⬜ pending |
| 35-05-T2 | PROMPT-04 (G4b) | still under the menu within 50 ms; pageStill parity | S | `--only gui02-web-tab-bridge` (+ self-test) | ✅ grows | ⬜ pending |
| 35-05-T3 | PROMPT-04 | extension entry works live; menu p95 ≤ 200 ms; G4b verdict recorded | L | `--scenario extension-entry,freeze-frame` | ✅ grows | ⬜ pending |
| 35-06-T1 | PROMPT-06 | PopupAutoComplete panel + overlay attribute | S | `--only shell-furniture`, `--only gui02-web-tab-bridge` (+ self-test) | ✅ grows | ⬜ pending |
| 35-06-T2 | PROMPT-06 | validation bubble furniture; textActions.ftl link; rules 9-10 | S | `--only shell-furniture-self-test` | ✅ grows | ⬜ pending |
| 35-06-T3 | PROMPT-06 | form history, saved login, validation bubble, paste popup live | L | `--scenario autocomplete,saved-login,form-validation,paste-popup` | ✅ grows | ⬜ pending |
| 35-07-T1 | PAGE-07 | FullScreen/PointerlockFsWarning stand-ins = upstream calls; warning subtree parity | S | `--only shell-gbrowser-standin`, `--only shell-furniture-self-test` | ✅ grows | ⬜ pending |
| 35-07-T2 | PAGE-07 | F11 page row (unreserved, Linux key parity), tab-switch exit, media row | S | `--only shortcut-relay` (+ self-test), `--only shell-furniture-self-test` | ✅ grows | ⬜ pending |
| 35-07-T3 | PAGE-07 + phase | element fullscreen with warning and Esc; F11 on a page; IDE keeps F11; every scenario once | L | `verify-page-furniture-live.mjs --scenario <all eighteen>` and `--self-test` | ✅ grows | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

**G4b record (D-08):** budgets 50 ms capture deadline, 200 ms p95 right-click to menu over 20
opens. Verdict line from 35-05-T3: `freeze-frame timing: …` (to be filled at execution).
**35-05 execution (2026-10-31, lane p35):** verdict **deferred**. The lane has no objdir, so the
live run stopped at `harness: … objdir/dist/bin/powerbrowser does not exist` after the
`purgecaches:` line, and no `freeze-frame timing:` line exists. The 50 ms deadline is enforced in
code (`PAGE_STILL_DEADLINE_MS`, a late capture is never pushed); the 200 ms p95 budget, the on-time
fraction and the still-arrival p50/p95 wait for the end-of-milestone live pass.

---

## Wave 0 Requirements

- [ ] `scripts/verify-shell-furniture.mjs` — created in 35-02-T2 (rules 1-4), grown in 35-03..35-07 (rules 5-12), registered as `shell-furniture` + `shell-furniture-self-test` (quick)
- [ ] `scripts/verify-page-furniture-live.mjs` — created in 35-02-T3, grown in every later plan, registered as `page-furniture-live` + `page-furniture-live-self-test` (live block)
- [ ] The stand-in gate's registry scope and shim comparison land in 35-01 before any shim exists

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Menu look/order vs Firefox | PROMPT-04 | Pixel and order parity | KWin raise + `spectacle`; open the page menu and the stock window's page menu side by side |
| Tooltip placement on overflow | PROMPT-08 | Screen-edge clamping | Hover a `title=` element near the window edge; check the `remoteBrowserTooltip` clamps inside |
| Warning banner pixels | PAGE-07 | Stock XUL rendering | Enter video fullscreen; screenshot the warning banner |
| Status-line truncation | PROMPT-08 | Ellipsis rendering | Hover a long URL; check one truncated line with full URL in `aria-label` |

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
