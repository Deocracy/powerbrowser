---
phase: 64-orca-panes-as-powerbrowser-tabs
plan: 03
subsystem: modes, chrome-bar, orca-shell
status: complete
tags: [orca, modes, chrome-bar, bridge-folder, pairing]
requires:
  - "Phase 63 coordinator merge (63-04): OrcaService bridge folder, writePrivateFile, orcad-data-root"
provides:
  - "Orca mode (id 'orca', label 'Orca') as the fourth shipped descriptor, IDE dress"
  - "web-pairing and orca-panes-dir in the bridge folder, written after ready, removed on stop (C5)"
  - "OrcaEnv ORCA_WEB_PAIRING_FILE, ORCA_PANES_DIR_FILE, ORCA_PANES_DIR_REL, readyLineOffer, sink onOffer"
affects:
  - "lane p64-02 orca-panes backend (reads both files)"
  - "lane p64-04 (Orca seed tabs in the mode-switch walk)"
  - "Phase 68 lanes p68-07 / p68-10 (same OrcaEnv, OrcaService, verify-orca-service files)"
tech-stack:
  added: []
  patterns:
    - "one-shot credential callback out of the output sink, never stored on the service"
    - "dress-set derivation: four sources compared as set equality"
key-files:
  created: []
  modified:
    - theia/extensions/modes/src/browser/mode-descriptors.ts
    - theia/extensions/modes/src/browser/mode-service.ts
    - theia/extensions/chrome-bar/src/browser/chrome-bar-widget.tsx
    - theia/extensions/chrome-bar/src/browser/chrome-bar.css
    - theia/extensions/chrome-bar/src/browser/address-bar/address-bar-mode-table.ts
    - scripts/verify-mode-toggle-commands.mjs
    - powerbrowser/shell/OrcaEnv.sys.mjs
    - powerbrowser/shell/OrcaService.sys.mjs
    - scripts/verify-orca-service.mjs
decisions:
  - "Orca mode address-bar default written as D-17's Address (orca: 'address'); behaviour unchanged, owner may pick another"
  - "Scenario I's canary is a form redact() has no pattern for, so the log clause proves the offer is never logged rather than that it is redacted"
  - "_writeHandOff is a new OrcaService method; _spawnAndGate gains only the onOffer callback and one call, to keep the Phase 68 merge surface small"
metrics:
  duration: "about 50 min"
  completed: 2026-11-10
estimate:
  tokens: 140000
  tasks: 2
actuals:
  tokens: 10300
  tasks: 2
  commits: 3
plan_head_before: b37ad5b17fe84ae995970b1c0126fdd6dcfedc87
plan_head_after: 48136628
---

# Phase 64 Plan 03: Orca mode, chrome-bar dress and bridge-folder hand-off files Summary

The Orca mode is now the fourth shipped mode and wears the IDE dress in all three places the chrome bar decides dress. Chrome writes this orcad's pairing offer and the pane bundle folder into 0600 files in the bridge folder after the ready line, and removes them on stop. The offer reaches no log line, state, diagnostics row or `parseReadyLine` result.

## Commits

| Task | Commit | Message |
|------|--------|---------|
| 1 (tracer) | b0ded1ab | feat(64-03): the Orca mode with the IDE dress, toggle check dress clause |
| 2 | c529163f | feat(64-03): offer and bundle-folder files in the bridge folder, orca-service scenario I |
| deviation | 48136628 | fix(64-03): address-bar default row for the Orca mode |
| summary | (this commit) | docs(64-03): lane summary |

## What was built

**Task 1 (TAB-01, P64-18, P64-19).**
- The `orca` descriptor is appended to `SHIPPED_MODES`. It has no activation hook and collapses left, right and bottom.
- `SHIPPED_MODE_RULES` gains the orca row with `furniture: true`, and the chrome bar's `MODES` literal ends with `'Orca'`.
- The IDE dress now covers `orca` in three places: `ideDress`, the menubar branch of `publishDragRegions`, and the top-panel menubar-height rule in chrome-bar.css.
- `verify-mode-toggle-commands.mjs` adds clause 5. It derives four mode sets and requires them to be equal: the ideDress initializer, the drag-region menubar branch, the CSS rules that read `--theia-private-menubar-height`, and the `furniture: true` rows. Any set that derives empty is red with "dress rule moved".
- The two reorder plants now build their anchors from the clean sources, so the next appended mode will not break them.
- Five new plants were added. All of them go red.

**Task 2 (P64-06, P64-07, P64-34, A6).**
- OrcaEnv gains the three C5 literals and `readyLineOffer`. `createOutputSink({ pushLog, onOffer })` calls `onOffer` once, just before it drops the buffer.
- OrcaService passes the value from `onOffer` into one local variable of the start attempt. A new `_writeHandOff(offer)` method runs after the orcad-data-root write. It writes `web-pairing`, then writes `orca-panes-dir` when `<web client root>/assets/pb-panes` exists. When the folder does not exist, it logs one line and sets the diagnostics row to "not built".
- `_stopTree` removes both files, best-effort, after the orcad-data-root removal.
- A new diagnostics row, "Orca tabs bundle", is added. No new PowerBrowserAPI member, no new environment name and no INTERNAL-APIS row.
- `verify-orca-service.mjs` adds scenario I (hand-off files), scenario I-b, the five plants the plan names, two cross-lane plants, and clause 11 (cross-lane literals). Self-test: 34/34 plants go red.

## Verification results (lane tree)

- Task 1 rows are green: gui07-mode-toggle-commands, gui07-mode-toggle-commands-self-test, gui07-mode-switch-tabs-invariant, gui07-mode-switch-tabs-invariant-self-test and gui07-mode-switch-tabs-live-self-test. The live self-test ran under the live lock: clean control green, 5/5 plants red.
- The modes and chrome-bar extensions compile.
- `diff-theia-core`: PASS (run inside `nix develop .#theia`, where `yarn` is available).
- Live mode-switch walk, run under the lock with ORCA_* unset, against the integration objdir and this lane's backend:
  - `verify-mode-switch-tabs-live: derived modes [coding, browsing, organising, orca] + stock 'default'; seed 'welcome'`
  - `verify-mode-switch-tabs-live: PASS -- 1 main-area and 2 bottom-area tab(s) survived every second-visit mode switch, attached`
  - The Orca seed tabs belong to lane p64-04, so the walk ran with the existing seed only.
- Task 2 rows are green: orca-service, orca-service-self-test, orca-bridge-dir, orca-bridge-dir-self-test, internals-boundary, internals-catalogue, ng-040-internals-catalogue-lines, shell-error-copy-no-internals, start-path-recovery and orca-service-live-self-test.
- The sink probe from the plan exits 0: `onOffer` ran exactly once, and the offer is in neither the `parseReadyLine` result nor the log.
- The orca-service PASS line names `I (hand-off files), I-b (no bundle folder)`, `orca-panes file names SKIP (lane p64-02 not merged)` and `bundle folder SKIP (lane p64-01 not merged)`.
- Cross-lane dry run: `check()` was pointed at the real `orca-panes-protocol.ts` from ServerDestroyer/p64-02 and the real `vite.pb-panes.config.ts` from p64-01. Both clauses report `compared`, with no failures.
- `verify-platform.sh --quick`: 349 PASS. Two rows are red, `scan-brand-residue` and `scan-brand-residue-self-test`, because of the brand rows this lane owes (below). The base b37ad5b1 scans green.

## Deviations from Plan

**1. [Rule 1 - Bug] The address-bar default table needed an orca key.**
- **Found during:** the Task 2 wrap-up `--quick` run.
- **Issue:** `address-bar-modes` requires the keys of `DEFAULT_MODE_BY_UI_MODE` to equal the chrome bar's MODES ids. Appending `'Orca'` turned it red (`table [browsing, coding, organising]` against `widget [..., orca]`).
- **Fix:** added `orca: 'address'` to `theia/extensions/chrome-bar/src/browser/address-bar/address-bar-mode-table.ts`. `defaultModeFor('orca')` already returned Address through the D-17 fallback, so behaviour is unchanged. `address-bar-modes` and its self-test are green.
- **Consequence:** the lane diff has one path outside `files_modified`, so the plan's lane-diff check names that file. It is the only extra path.
- **Commit:** 48136628

**2. [Rule 1 - Bug] The scenario I canary was redactable.**
- **Issue:** a canary in `#pairing=` form is rewritten by `_pushLog`'s `redact()`. The "offer copied to pushLog" plant therefore stayed green, and the clause proved redaction instead of absence.
- **Fix:** the canary is now a plain URL path segment that `redact()` does not match, and the scenario asserts that `redact(canary) === canary` so the guard cannot become vacuous.

**3. Commit layout.** The summary is committed separately from the Task 2 code commit, not in it.

## Owner items (recorded, not asked)

1. **Custom mode named "Orca".** `mode-service.ts` skips a stored custom mode whose name equals a shipped label. A user's existing custom mode called "Orca" is hidden while the shipped Orca mode exists. Nothing was changed for this.
2. **Address-bar default for the Orca mode.** It is written as Address, which is D-17's fallback. The decided rows for the other modes are Chris's choices (coding: command-centre, browsing: address, organising: tabs). Orca may want command-centre like Coding, since it wears the IDE dress.
3. **T-61-04 / P64-07 still stands.** Orca's renderer runs in the authenticated Theia document. The offer file is 0600 in the 0700 bridge folder.

## Brand rows needed (inventory/brand-tokens.json not edited)

Measured with `node scripts/scan-brand-residue.mjs --report .mozbuild/p64-03/brand-report.md` on the staged lane tree.

Held-back counts, expected → observed on the lane tree:
- `Orca` (title/coincidental): 637 → 664 (+27)
- `orca` (lower/coincidental): 1287 → 1323 (+36)
- `ORCA` (upper/coincidental): 294 → 318 (+24)
- `orcad` (lower/coincidental): 783 → 792 (+9)
- `ORCAD` (upper/coincidental): 107 → 109 (+2)

Condition-4 occurrences that no row claims (line numbers are on the lane tree):
- powerbrowser/shell/OrcaService.sys.mjs: 468, 475, 483, 574 (twice) — `ORCA`
- scripts/verify-mode-toggle-commands.mjs: 520, 522, 530, 536, 538, 544, 546, 549 — `orca`
- theia/extensions/chrome-bar/src/browser/address-bar/address-bar-mode-table.ts: 45 — `orca`
- theia/extensions/chrome-bar/src/browser/chrome-bar-widget.tsx: 394, 2084, 2085 — `Orca`; 2086, 2262 — `orca`
- theia/extensions/chrome-bar/src/browser/chrome-bar.css: 1179, 1191 — `orca`
- theia/extensions/modes/src/browser/mode-descriptors.ts: 49, 51, 52, 55 — `Orca`; 53, 54, 61 — `orca`
- theia/extensions/modes/src/browser/mode-service.ts: 116 — `orca`

The counts move again when Phase 68's lanes merge into the same files. Re-measure on the merged tree.

## Coordinator proof commands

Run after the merged builds: the Theia `yarn build`, and `./mach build faster` with `MOZ_PURGE_CACHES=1` or a `-purgecaches` launch, because chrome JS changed.

```sh
scripts/verify-platform.sh --only orca-service          # PASS line must say "orca-panes file names compared; bundle folder compared"
scripts/verify-platform.sh --only orca-service-self-test
scripts/verify-platform.sh --only gui07-mode-toggle-commands
scripts/verify-platform.sh --only gui07-mode-toggle-commands-self-test
scripts/verify-platform.sh --only address-bar-modes
flock /home/chris/coding/Power-Browser/.git/pb-live.lock env $(env | sed -n 's/^\(ORCA_[A-Za-z0-9_]*\)=.*/-u \1/p') \
  PB_FIREFOX_BIN=<merged objdir>/dist/bin/powerbrowser PB_BACKEND_MAIN=<merged>/theia/applications/browser/lib/backend/main.js \
  node scripts/verify-mode-switch-tabs-live.mjs          # with lane p64-04's Orca seeds: derived modes [coding, browsing, organising, orca]
scripts/verify-platform.sh --only orca-service-live     # live, under the lock; web-pairing / orca-panes-dir present after ready, gone after stop
node scripts/scan-brand-residue.mjs                      # after the brand rows above are added
```

## Merge note for the coordinator

- Merge this lane third (after 64-01 and 64-02).
- Chrome JS changed (OrcaEnv.sys.mjs, OrcaService.sys.mjs), so use the faster build and `MOZ_PURGE_CACHES=1`.
- Phase 68's lanes p68-07 and p68-10 also edit OrcaEnv.sys.mjs, OrcaService.sys.mjs and verify-orca-service.mjs. Resolve any conflict there under 64-05 merge rule (6), function by function. This lane's hunks:
  - OrcaEnv: three constants after `ORCAD_DATA_ROOT_FILE`; `readyLineOffer` before `isLoopbackEndpoint`; and in `createOutputSink`, the signature, doc comment and the `onOffer` call.
  - OrcaService: the `_panesBundle` field; in `_spawnAndGate`, the `onOffer` callback at the sink and `await this._writeHandOff(offer); offer = null;` after the data-root write; the new `_writeHandOff` method before `_supervise`; the loop in `_stopTree`; one diagnostics row.
  - verify-orca-service.mjs: scenario keys `I` and `I-b`. If p68-07 also adds `I`, re-letter under rule (6) and keep the PASS-line label map in step. Also: the new path keys, `handOffRun`/`scenarioI`/`scenarioIb`/`handOffClauses`, the fixtures and plants in the self-test, and the PASS line.
- No registry edit and no WINDOWS.md ids. The brand rows above are still needed.
- The address-bar table is one extra file outside `files_modified` (deviation 1).

## Known Stubs

None. When the bundle has not been built, the result is a log line and the "not built" diagnostics row. That is the designed state until lane p64-01's build runs.

## Threat Flags

None beyond the plan's threat register. T-64-13 is mitigated: scenario I and its plants cover log, state, diagnostics and `parseReadyLine`.

## Not done in this lane

- `orca-service-live` was not run. The only built objdir is the integration worktree's, and it serves that tree's chrome JS, not this lane's, so a live run here would not test these changes. It is listed in the coordinator proof commands.

## Self-Check: PASSED

- All nine modified files exist on the branch.
- Commits b0ded1ab, c529163f and 48136628 are ancestors of HEAD.
