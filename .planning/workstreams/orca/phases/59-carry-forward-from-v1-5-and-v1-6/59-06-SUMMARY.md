---
phase: 59
plan: 59-06
status: in_progress
started: 2026-11-18
---

# 59-06 summary: v1.5 human checks (CF-17)

In progress. Claude drives, Chris judges; every verdict below is Chris's answer in the box.

## Verdicts

| item | verdict | evidence | follow-up |
|------|---------|----------|-----------|

## Runs

All on objdir/dist/bin/powerbrowser in this worktree, 2026-11-18, headed (PB_LIVE_HEADED=1).

- `scripts/verify-platform.sh --only real-input-gate-self-test`: PASS
- `node scripts/verify-page-tools-live.mjs`: exit 0 (print, save, edit, edit-greying, edit-today, print-today PASS among its scenarios)
- `node scripts/verify-page-tools-live.mjs --self-test`: PASS, clean control green, 23 planted faults red
- `node scripts/verify-address-bar-live.mjs --scenario bookmark-star,bookmark-editor,bookmark-keys`: PASS
- `node scripts/verify-address-bar-live.mjs --scenario reopen-closed,history-menu`: PASS
- `node scripts/verify-address-bar-live.mjs --scenario bookmarks-toolbar`: PASS
- `node scripts/verify-address-bar-live.mjs --scenario clear-history`: PASS
- `node scripts/verify-address-bar-live.mjs --scenario app-menu,actions-list,command-centre-privacy`: exit 0
- `node scripts/verify-tab-strip.mjs`: PASS
- `node scripts/verify-registry-shape.mjs`: PASS
- `node scripts/verify-tab-strip-live.mjs`: PASS
- `PB_REAL_INPUT=1 PB_LIVE_HEADED=1 node scripts/verify-nav-keys-live.mjs --scenario long-press`: PASS; WINDOWS 27 marked fixed with `gsd-tools windows fixed 27`, ROADMAP 999.28 follow-up ticked
- Not run in this pass: `verify-address-bar-live.mjs --self-test` and `verify-tab-strip.mjs --self-test`, `verify-tab-strip-live.mjs --self-test` (LIVE-PASS lists them; gate run 5 ran the registered self-tests the same day)
