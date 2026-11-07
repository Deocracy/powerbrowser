---
phase: 39-v1-5-close-out
plan: 19
subsystem: verification
tags: [verify-platform, gate, windows-ledger, backlog, close-out]
status: complete
requires: [39-18]
provides:
  - "39-BASELINE.md ## Final run: full run 452 PASS / 36 FAIL at 6ac27ac2, --gate PASS-WITH-EXCLUSIONS at 77e5d037 (456 PASS, 32 excluded)"
  - "GATE_KNOWN_OPEN_EXCLUSIONS keyed only to open WINDOWS.md entries (25, 28-43); the rows keyed to fixed entries 5 and 10 removed"
  - "WINDOWS.md entries 30-43; repro, cause so far and source added to 25, 27, 28"
  - "ROADMAP backlog 999.18-999.32 and a ledger-26 line in 999.3"
  - "objdir-release rebuilt at 153.5.1 with the Deocracy vendor"
affects: [39-20, v1.6 deploy owner pass]
tech-stack:
  added: []
  patterns:
    - "a gate exclusion entry (label|<ledger id>|reason) is told apart from a registry row by the numeric second field"
key-files:
  created:
    - .planning/phases/39-v1-5-close-out/39-19-SUMMARY.md
  modified:
    - scripts/verify-platform.sh
    - scripts/verify-release-shape.mjs
    - inventory/brand-tokens.json
    - .planning/WINDOWS.md
    - .planning/ROADMAP.md
    - .planning/phases/39-v1-5-close-out/39-BASELINE.md
key-decisions:
  - "No product code changed: the fix window closed at 39-18, so every product red is a ledger entry plus a backlog row"
  - "shell01's static scan skips chrome://browser/skin/ stylesheet hrefs: a stock skin file is CSS and cannot add chrome (harness fix, path 1)"
  - "Gate exclusions are grouped by cause: one ledger entry for the ten release-artifact rows, one for the seven live-owner-state rows, one for macOS"
  - "Known flakes with open entries (page-tools-live 28, ng067 42, page-furniture-live-self-test 43) carry exclusions so a single flake cannot fail a 3.7 h gate; an exclusion only excuses a red"
  - "--gate ran once, after the last change, instead of once before triage and once after; its log holds a full registry run at the final commit"
requirements-completed: []
plan_head_before: 6ac27ac2b2e8abec1d009b8e95429564735f3398
plan_head_after: 7040e50ec14963a8fd92fa273b05222f8c3d3966  # the last commit before this SUMMARY's own docs commit
actuals:
  tokens: 17641
  tasks: 2
  commits: 3
duration: "about 9 h 30 min wall (two 3.7 h registry runs, reruns, a 24 min release build)"
completed: 2026-11-07
---

# Phase 39 Plan 19: Full run, gate and residuals Summary

The v1.5 close-out gate passes with exclusions: `--gate PASS-WITH-EXCLUSIONS` at 77e5d037. Each of the 32 excluded reds is keyed to an open WINDOWS.md entry with repro, cause so far and source, and each has a ROADMAP backlog row. The full run at 6ac27ac2 gave 452 PASS and 36 FAIL. Two of those 36 were fixed in this plan: shell01 by a harness fix and the release identity row by rebuilding `objdir-release/`.

## Task 1: full run, --gate, triage

- Full run: `flock /tmp/nix-shell.75PsxP/pb-headed.lock -c 'PB_NG_ALLOW_DIRTY=1 nix develop .#theia --command scripts/verify-platform.sh'`, 13372 s, exit 1, 452 PASS / 36 FAIL. Log: /tmp/nix-shell.75PsxP/pb-39-19/full.log.
- Reruns (`--only`, logs in /tmp/nix-shell.75PsxP/pb-39-19/rerun/): 7 stayed red. ng067 and page-furniture-live-self-test were green 2 of 2 after the red, so they count as flaky. prompts-live-self-test was red 2 of 3, and it was red again in the gate.
- Path 2: rebuilt `objdir-release/` (clobber + build, 1429 s). `verify-branding-identity-release` then passed, and `branding-variant-divergence` passed again.
- Path 1: shell01 harness fix (02570bcd). The row passed alone and in the gate.
- Path 3: 14 new ledger entries, 30-43, and 35 exclusion rows covering 34 labels that are red or known to flake.
- Gate: `flock ... --gate`, 13410 s, 456 PASS / 32 FAIL, all excluded. Log: /tmp/nix-shell.75PsxP/pb-39-19/gate.log.

```
verify-platform: --gate PASS-WITH-EXCLUSIONS -- commit 77e5d0372b447272e8a0317e1fabf7b53e75ef32 -- 32 named known-open exclusion(s)
```

EXT-01 (`extension-pins`), EXT-02 (`verify-downstream-fixtures`) and EXT-03 (`webextensions`, `ng073-declared-extension-loads`) and their self-tests passed in both runs.

### Red-row classification (final full run, 36 reds)

| class | labels | ledger / backlog |
|-------|--------|------------------|
| fixed in 39-19 | shell01-theia-is-the-window (harness), verify-branding-identity-release (objdir-release rebuild) | none |
| expected, documented | address-bar-live-self-test; extension-actions-live, extension-actions-live-self-test | 25 / 999.27; 29 / 999.17 |
| flaky, rerun evidence | ng067-frontend-errors-reach-telemetry (red 1 of 3, gate PASS), page-furniture-live-self-test (red 1 of 3, gate PASS) | 42, 43 / 999.30 |
| defect, new entry | prompts-live-self-test (39), site-identity-live + self-test (40), verify-customize-inert (34), start-failure-shows-error (36), pan04-undo-close-group-live (37), ng-023-suggestions-history-bookmarks (38), first-boot-surface-fresh (41) | 999.30, 999.31 |
| owner or environment step | 10 release-artifact rows (30); 7 live-owner-state rows (31); 2 macOS rows (32); tel06-error-delivery-live (33); ng089-uat-sheets (35) | 999.32 |

Baseline reds that are green now: page-furniture-live, address-bar-live, prompts-live (fix plans); updates-repo-static, website-publish-ready, win-sign-chain (environment changed); ng-018 (baseline flake). The full before/after table is in 39-BASELINE.md `## Final run`.

### Residuals (gate exclusions, each an open ledger entry)

25 ctrl-d-everywhere plant; 28 crash-navigate flake (pre-emptive, page-tools-live passed); 29 private-window options page; 30 release artifacts; 31 live owner state; 32 macOS (v1.7); 33 tel06 dirty tree; 34 customize-inert; 35 v1.2/v1.3 UAT sheets; 36 start-failure classification; 37 pan04 focus; 38 ng-023 ranking; 39 prompts plant; 40 site-identity app-menu; 41 first-boot TypeError; 42 ng067 flake; 43 page-furniture self-test flake. Also open and not excluded: 11, 19, 24, 26, 27. `windows status` open_count is 22: 17 residuals listed here, 11, 19 and 24 from before the phase, and 26 and 27 from this phase, which no row needs excluded.

## Task 2: follow-ups and residuals to backlog

- 999.18-999.26: 32 T3, 32 T8, 34 T15 (with T9 and T14), 35 T21, 37 T35, 37 T36 with 38 T37, 37 T41 with 38 T38, 38 T32, 38 T33. 38 T22 was already 999.17.
- 999.27-999.29: ledger 25, 27, 28. 999.30-999.32: ledger 30-43, each line with its repro, cause so far, source and entry id. 999.3 has a line for ledger 26.
- The plan's verify printed `follow-ups covered`, but it passes vacuously: its regex `^- .*?(T\d+)` matches none of the yaml `- test: N` items. A derived check (scratch /tmp/nix-shell.75PsxP/claude-1000/-home-chris-coding-Power-Browser/0e65b9de-330c-4679-93d5-f2360adf8d08/scratchpad/check-followups.mjs) parses the yaml items deferred on or after 2026-11-05 plus the open 34-UAT bullets. It found 14 items, went red on all 13 uncovered ones before the edit, and printed `follow-ups covered; planted 32 T999 reported missing` after.

## Deviations from Plan

1. **[Rule 3 - Blocking] brand inventory count.** The exclusion rewrite deleted two `01-04-PLAN.md` citations, so `scan-brand-residue` went red, with `-PLAN.md` expected at 68 and observed at 66. The count is now 66 in `inventory/brand-tokens.json`, and its reason field gives the justification (02570bcd).
2. **[Rule 1 - Bug] release-shape label reader.** `verify-release-shape.mjs` counted every `"label|` line as a registered label, so the new `install-matrix|30|...` exclusion hid its `install-matrix unregistered` plant and `release-shape-self-test` went red. Exclusion entries (numeric second field) are now skipped. The self-test passes with 68 workflow faults red (02570bcd).
3. **Gate order.** The plan ran `--gate` both before and after triage. It ran once here, after the last change, which saved 3.7 h. Its log contains a full registry run at 77e5d037.
4. **Plan verify, page-furniture-live-self-test.** The plan greps for this row's PASS in `full.log`, but the row was red there. It passed in the gate log (a full run at the final commit) and in 2 of 3 runs before that. Ledger 43 records it as a flake. The literal verify line fails on full.log, and full.log was not edited.
5. **Release build needed a clobber.** The incremental build stopped on the upstream "Merge day clobber" notice. `./mach clobber` on `objdir-release/` follows docs/BUILD.md row #5. The release branding path is now `powerbrowser/branding-generated/release`, to match the dev objdir. BUILD.md still shows the older `powerbrowser/branding/release` and was not edited.
6. **Commit attribution.** Commits end with `Co-Authored-By: Claude Opus 5.5`, as the session's attribution reminder requires. The dispatch asked for `Claude Fable 5.1`.
7. **Commit message count.** 02570bcd says "34 labels". The array has 35 entries covering 34 labels: extension-actions-live and its self-test are two labels on entry 29, and the 35th entry is page-tools-live. Recorded here because amend is not allowed.
8. **Headed lock.** Both 3.7 h runs held `/tmp/nix-shell.75PsxP/pb-headed.lock`, because `real-input-gate-self-test` raises a headed window inside them. That made 2 headed runs. The ten `--only` reruns were headless and ran without the lock.

## Commits

- 02570bcd fix(39-19): key every v1.5 close-out red to an open ledger entry; shell01 skips stock skin hrefs
- 77e5d037 docs(39-19): phase-39 follow-ups and residuals become backlog rows 999.18-999.32
- 7040e50e docs(39-19): Final run -- full 452/36 at 6ac27ac2, --gate PASS-WITH-EXCLUSIONS at 77e5d037

## Known Stubs

None.

## Not done

- No product fixes (the fix window closed at 39-18). The eight defect rows are backlog 999.30 and 999.31.
- No container-built tarball or MAR hop: those are owner steps in the deploy OWNER-PASS.md.
- STATE.md, the ROADMAP progress table and the plan checkbox are left to 39-20. No REQUIREMENTS.md row was ticked.

## Self-Check: PASSED

- FOUND: 39-BASELINE.md `## Final run`, WINDOWS.md entries 30-43, ROADMAP 999.18-999.32
- FOUND: 02570bcd, 77e5d037, 7040e50e (ancestors of HEAD)
- `scripts/verify-platform.sh --quick` PASS on the staged 02570bcd tree; brand scan PASS before each docs commit
