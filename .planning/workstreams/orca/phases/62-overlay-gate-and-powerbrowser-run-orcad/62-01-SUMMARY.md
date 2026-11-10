---
phase: 62-overlay-gate-and-powerbrowser-run-orcad
plan: 01
subsystem: build
tags: [orca, overlay, patches, gate, self-test]

requires:
  - phase: 60-orca-from-source-on-theia-s-node
    provides: scripts/build-orca.sh, scripts/fetch-orca.sh, orca-build-shape, the Orca pin in configuration.toml
provides:
  - orca-overlay/ (seams.json, patches/) as the only place PowerBrowser changes Orca
  - build-orca.sh step 1b (overlay apply, re-runnable)
  - scripts/verify-orca-overlay.mjs (default, --built, --self-test) and rows orca-overlay, orca-overlay-self-test, orca-overlay-built
  - the RUN-04 seam ORCA_DISABLE_INSTALLED_ELECTRON_BROWSER in the built orcad
  - configuration.toml [orca] seam_cap
affects: [62-02, 62-03, 63, 64, 65, 66, 68]

actuals:
  tokens: 14000
  tasks: 3
  commits: 5

tech-stack:
  added: []
  patterns:
    - "Overlay state written from a spec object in the self-test, so undoing a plant is writing the base again"
    - "Fixture patches made by the real regenerate-patches.sh write mode from a seed header"

key-files:
  created:
    - orca-overlay/seams.json
    - orca-overlay/patches/010-installed-electron-switch.patch
    - scripts/verify-orca-overlay.mjs
  modified:
    - scripts/build-orca.sh
    - scripts/verify-orca-build-shape.mjs
    - scripts/verify-platform.sh
    - configuration.toml
    - scripts/lib/config-schema.json
    - docs/REBRANDING.md
    - docs/BUILD.md

key-decisions:
  - "Marker literals are matched as whole tokens (pb-overlay: followed by path characters), so src/x.ts does not match inside src/x.tsx"
  - "The 20-line bound is checked from git apply --numstat alone, so it also runs when orca/ is not fetched"

requirements-completed: [OVL-01, OVL-05]

coverage:
  - id: D1
    description: "One declared seam, regenerated, applied by build-orca.sh step 1b, present in the built orcad"
    requirement: RUN-04
    verification:
      - kind: integration
        ref: "nix develop .#orca --command bash scripts/build-orca.sh (twice); grep ORCA_DISABLE_INSTALLED_ELECTRON_BROWSER orca/out/orcad/orcad-server.js"
        status: pass
  - id: D2
    description: "The overlay gate goes red, naming the fault, on every OVL-01 and OVL-05 fault"
    requirement: OVL-01
    verification:
      - kind: unit
        ref: "scripts/verify-platform.sh --only orca-overlay-self-test (22 plants)"
        status: pass
      - kind: integration
        ref: "scripts/verify-platform.sh --only orca-overlay"
        status: pass
  - id: D3
    description: "A PB-added file that Orca's builds do not compile is red (marker literal method)"
    requirement: OVL-05
    verification:
      - kind: integration
        ref: "scripts/verify-platform.sh --only orca-overlay-built (vacuous PASS at zero files; self-test plants built-marker-absent and built-marker-only-in-node_modules)"
        status: pass
  - id: D4
    description: "orca-build-shape accepts exactly the declared seams"
    requirement: OVL-01
    verification:
      - kind: unit
        ref: "scripts/verify-platform.sh --only orca-build-shape-self-test (10 plants, seam-not-applied included)"
        status: pass
      - kind: integration
        ref: "scripts/verify-platform.sh --only orca-build-shape"
        status: pass
---

# Phase 62 Plan 01: Overlay gate and the hidden-Electron seam Summary

`orca-overlay/` holds one declared, regenerated seam; `build-orca.sh` applies it re-runnably; `verify-orca-overlay.mjs` proves the overlay stays additive and capped, with 22 planted faults each going red by name.

Status: complete. All three tasks done; no blocker.

## Commits

| Task | Commit | Files |
|------|--------|-------|
| 1 | 04974f7a | orca-overlay/seams.json, orca-overlay/patches/010-installed-electron-switch.patch, scripts/build-orca.sh, scripts/verify-orca-overlay.mjs, scripts/verify-platform.sh |
| 2 | fbae49e8 | scripts/verify-orca-overlay.mjs, configuration.toml, scripts/lib/config-schema.json, docs/REBRANDING.md, scripts/verify-platform.sh |
| 3 | 9a93f27f | scripts/verify-orca-build-shape.mjs, docs/BUILD.md |
| 3 | fbf3f423 | 62-01-SUMMARY.md |
| 3 | the commit after fbf3f423 | 62-01-SUMMARY.md (this table corrected) |

Note on 9a93f27f: this lane session staged the two Task 3 files and, before its own commit ran, a process other than this session committed exactly those staged files on the lane branch (author line as the others, co-author trailer "Claude Opus"). Its content equals this session's working tree (`git status` was clean after fbf3f423), so nothing was lost or added; Task 3 is therefore three commits instead of one. No amend was made.

## The seam

- Path: `src/main/orcad/orcad-browser-provider.ts`
- Upstream blob at the pin 965978bc: `90b79e505d8db41a8cf61cb45dd41f36658a6966`
- Patch: `orca-overlay/patches/010-installed-electron-switch.patch`, +3/-0, one hunk, first statement of `installedElectronCandidates`
- Switch literal: environment name `ORCA_DISABLE_INSTALLED_ELECTRON_BROWSER`, value the string `1` (lane p62-02 sets it)
- Produced by `regenerate-patches.sh --upstream orca --patches orca-overlay/patches` from a seed header; `--check` passes on `orca/` and on the gate's hermetic replay
- In the built orcad: `orca/out/orcad/orcad-server.js` contains the switch literal

## Rows

| Row | Tier | Result in this lane |
|-----|------|---------------------|
| orca-overlay | quick | PASS, 1 seam, 0 overlay files |
| orca-overlay-self-test | quick | PASS, 6 controls green, 22 plants red by name (about 3 s) |
| orca-overlay-built | full | PASS, vacuous at 0 files |
| orca-build-shape | full | PASS, 1 modified tracked file, equal to the declared seam |
| orca-build-shape-self-test | quick | PASS, 10 plants, control declared-seam-modified green |
| orca-slotless-start-self-test | quick | PASS (still imports walk) |
| verify-rebranding-docs | quick | PASS, 48/48 schema fields |

`node scripts/generate.mjs --check` passes with `[orca] seam_cap = 10`.

## Build hook, proven on the real tree

- Two consecutive builds exit 0 with `build-orca: overlay applied src/main/orcad/orcad-browser-provider.ts` (24 s and 22 s warm).
- An appended line in `orca/README.md` stops the build with `undeclared modification in orca/: README.md`; nothing is reset first.
- A temporary untracked `orca-overlay/files/src/pb/probe.ts` was copied (`overlay copied`), listed in `orca/.pb-overlay-copied`, and made `orca-overlay-built` red as not compiled; a `files/package.json` was refused as `overlay file shadows upstream path package.json`; after `files/` was deleted the next build removed the copied file and the list. The probe was never staged or committed.

## Deviations from the plan

1. Setup: this worktree had no `.mozbuild/`, so `.mozbuild/pnpm-store` is a symlink to the coordinating workspace's store (ignored path, content-addressed, read mostly). The pristine build took 43 s.
2. The 20-line bound runs from `git apply --numstat` with or without `orca/`; the plan listed it among the steps that need `orca/`. Stricter, same result.
3. Self-test has 22 plants, not 21: `cap-key-absent` was added. It also has a control for an absent `orca/` (tracked rules green behind a printed SKIP).
4. The hook additionally refuses an `orca/.pb-overlay-copied` entry that names an upstream path, so a tampered list cannot delete an upstream file.
5. The existing build-shape plant `modified-tracked-file` now names `modified tracked file in orca/: M package.json` (was `package.json`), so it cannot pass on the new seam message.

## Brand scan (for the coordinator; inventory/brand-tokens.json not edited)

`node scripts/scan-brand-residue.mjs --report .mozbuild/p62-01/brand-report.md` on the staged lane tree: FAIL, 98 reconciliation failures, as expected.

Held-back rows (files already listed in those rows gained hits):

| Row | Expected | Observed |
|-----|----------|----------|
| Orca (title) | 93 | 98 |
| orca (lower) | 420 | 489 |
| orcad (lower) | 179 | 180 |

Unclaimed probe hits (files not yet in any row's `only_in`):

| File | orca | Orca | ORCA |
|------|------|------|------|
| scripts/verify-orca-overlay.mjs | 78 | 2 | 0 |
| orca-overlay/patches/010-installed-electron-switch.patch | 8 | 0 | 1 |
| orca-overlay/seams.json | 2 | 1 | 1 |
| docs/REBRANDING.md | 0 | 2 | 0 |

These counts predate this SUMMARY and are from the lane tree only; remeasure on the merged tree. No in-word join that would need a new `literal` row was reported.

## Quick gate in this worktree

`scripts/verify-platform.sh --quick`: 111 rows red. 109 are the worktree's environment (no `upstream/`, no `theia/node_modules`, no built Theia lib); the other two are `scan-brand-residue` and `scan-brand-residue-self-test`, both from the brand rows above. Every row this lane added or changed is green.

## Not done here

- RUN-04 is half this lane's: the seam exists and is built in. Setting the switch and proving the stock launch and its absence is lane p62-02 (`orca-hidden-electron`).
- No live PowerBrowser run was needed or made.

## Merge note for the coordinator

Rebuild Orca after merge (`nix develop .#orca --command bash scripts/build-orca.sh`) so `orca/` carries the seam; until then `orca-build-shape` is red with `seam not applied`. Registry blocks at both anchors come before p62-02's. Brand rows for `orca-overlay/**`, `scripts/verify-orca-overlay.mjs`, `configuration.toml`, `scripts/lib/config-schema.json`, `docs/REBRANDING.md`, `docs/BUILD.md` and `scripts/build-orca.sh` (and `scripts/verify-orca-build-shape.mjs`, `scripts/verify-platform.sh`) are the coordinator's to measure. No WINDOWS.md ids.

## Self-Check: PASSED

Files listed above exist; commits 04974f7a, fbae49e8, 9a93f27f and fbf3f423 are on `ServerDestroyer/p62-01`; the lane diff against the merge base lists only `files_modified` paths.
