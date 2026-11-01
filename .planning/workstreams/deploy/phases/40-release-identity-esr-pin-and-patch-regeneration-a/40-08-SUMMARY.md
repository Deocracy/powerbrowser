---
phase: 40-release-identity-esr-pin-and-patch-regeneration-a
plan: 08
subsystem: infra
tags: [dev-build, esr-153.5.1, update-channel, ng064, licensing, endpoints, toolchain-baseline, rebase-upstream, owner-checkpoint]
status: complete

requires:
  - phase: 40-07
    provides: "generate-licensing.mjs --check with the built about:license comparison; all Phase 40 tree changes (40-01 to 40-07)"
provides:
  - "A dev build of FIREFOX_153_5_1esr_RELEASE in this worktree's objdir/, reporting 153.5.1esr"
  - "Built-tree evidence: one update channel in config.status, ng064 PASS, built about:license byte match, layer 3 PASS, empty toolchain-baseline diff"
  - "Owner-reported About-dialog pass (UPD-13 live half)"
  - "The first real rebase-upstream.yml run, dispatched by the owner against FIREFOX_153_5_1esr_RELEASE: success"
affects: [Phase 41, Phase 43 AUTO-06, Phase 44/50 MAR hop drill, Phase 49/50 release tooling, Phase 51 Renovate, UPD-25]

actuals:
  tokens: 0        # no tracked file changed; evidence only (this SUMMARY is the docs commit)
  tasks: 3
  commits: 0
plan_head_before: 2d4225a2de420519ef51a0dd0f213b49dbf1e579
plan_head_after: 2d4225a2de420519ef51a0dd0f213b49dbf1e579

tech-stack:
  added: []
  patterns:
    - "Owner gates (About dialog on a display, push, workflow dispatch) are one blocking-human checkpoint; the executor records the owner's reported result"

key-files:
  created: []
  modified: []

key-decisions:
  - "The full mar-update-hop row was not run in Phase 40; only its self-test ran. The live N to N+1 hop is a Phase 44/50 drill"
  - "The About-dialog result is recorded as an owner-reported pass, without per-link detail"

patterns-established: []

requirements-completed: [DIST-06, AUTO-08, UPD-11, UPD-12, UPD-13]

duration: 2824s build plus owner checkpoint
completed: 2026-10-21
---

# Phase 40 Plan 08: dev build of 153.5.1esr, built-tree checks and the first rebase-upstream.yml run Summary

**`scripts/smoke-firefox.sh` built FIREFOX_153_5_1esr_RELEASE in this worktree with the Phase 40 `.mozconfig` in 2824 s, and the binary reports 153.5.1esr. On the built tree: config.status carries update channel `default` and MAR channel id `powerbrowser-default`, ng064 passes, the generated notices byte-match the built about:license, layer 3 passes, and the toolchain-baseline diff is empty. The owner confirmed the About dialog, pushed `workspace/deploy` at 2d4225a, and dispatched the first real `rebase-upstream.yml` run against FIREFOX_153_5_1esr_RELEASE, which concluded success.**

## Performance

- Build wall time: 2824 s (about 47m04s), measured from `.mozbuild/phase40-smoke.start` and `.mozbuild/phase40-smoke.end`
- Completed: 2026-10-21
- Tasks: 3 of 3
- Files: none tracked (evidence only)

## Timing row (docs/BUILD.md shape)

| Build | Tree, host, date | Command | Wall time | Source |
|-------|------------------|---------|-----------|--------|
| dev, `objdir/` | **Power Browser tree** at `FIREFOX_153_5_1esr_RELEASE`, `legion`, 2026-10-20 | `nix develop .#firefox --command bash scripts/smoke-firefox.sh` (which runs `MOZCONFIG=../.mozconfig ./mach build`) | **2824s (~47m04s)** | `40-08-SUMMARY.md` |

Toolchain from the flake-locked `.#firefox` shell: rustc 1.97.1, cargo 1.97.0, cbindgen 0.29.4.

## Accomplishments

### Task 1: build and channel read-back

- `.mozbuild/phase40-smoke.exit` contains `0`. The log ends with `smoke-firefox: PASS -- reports 153.5.1esr (read from upstream/browser/config/version_display.txt)`.
- `configStatus()` from `scripts/lib/built-tree.mjs` returns:
  - `MOZ_UPDATE_CHANNEL` = `default`
  - `MAR_CHANNEL_ID` = `powerbrowser-default`
  - `ACCEPTED_MAR_CHANNEL_IDS` = `powerbrowser-default`
- Binary: `objdir/dist/bin/powerbrowser`.

### Task 2: built-tree checks

- `--only ng064-update-url-from-manifest`: PASS. application.ini `[AppUpdate]` and the binaries name updates.powerbrowser.org, and policies.json carries no update URL.
- `node scripts/generate-licensing.mjs --check`: PASS, with no `SKIP -- built about:license` line. The generated Gecko section byte-matches the built `license.html`, which proves `LINUX_LICENSE_DEFINES` for this build.
- `--only mar-update-hop-self-test`: PASS.
- The full `mar-update-hop` row: **not run**. It needs two builds and a hop drive, deferred to Phase 44/50.
- `verify-endpoints.sh --layer 3`: exit 0, `layer 3 PASS -- all resolved hosts are allowlisted`. No host list, so neither powerbrowser.org nor github.com resolved unattended. Log: `.mozbuild/phase40-layer3.log`.
- `toolchain-baseline.sh | diff - toolchain-baseline.txt`: empty diff.
- `theia/applications/browser/lib` present.
- `scripts/verify-platform.sh --quick`: PASS.

### Task 3: owner checkpoint

- **About dialog:** owner-reported pass. The owner reported the check done with no problems: "Release notes" opened the GitHub releases page, the manual-download link opened powerbrowser.org, and the Browser Console showed no URL error.
- **Push:** `origin/workspace/deploy` = `2d4225a`.
- **First dispatch of `rebase-upstream.yml`**, tag `FIREFOX_153_5_1esr_RELEASE`, ref `workspace/deploy`:
  - Run: https://github.com/DeBIOS-Foundation/powerbrowser/actions/runs/39725128513
  - Conclusion: **success**. Job `rebase`, 4m5s.
  - All steps green: brand scan, generate in nix, freshness, byte-identity, rebase onto tag, re-check byte-identity.
  - Annotations only: Node 20 deprecation for `actions/checkout`, and `ubuntu-latest` migrating to Ubuntu 26.
  - The branch-ref dispatch worked, so the `--ref main` fallback (assumption A6) was not needed.

## Task Commits

None. Tasks 1 and 2 produce gitignored build output and logs, and Task 3 is the owner's. The only commit is this plan's docs commit.

## Deviations from Plan

None. The plan ran as written.

## Issues Encountered

None blocking. The known notes are listed below.

## Known Notes and Hand-offs

- **Release tagging and `[product] revision`:** tagging a release turns `--quick` red until `[product] revision` in `configuration.toml` is bumped. The Phase 49/50 release tooling must bump it.
- **`app.update.promptWaitTime`:** it defaults to 12 h here, while official Firefox uses 8 days. Tracked under UPD-25.
- **Bump PRs must regenerate licensing:** every ESR, Theia or Node bump changes the notices, so a bump PR must run `node scripts/generate-licensing.mjs` or the `licensing` row turns it red (Phase 43 AUTO-06, Phase 51 Renovate).
- **`actions/checkout` Node 20 annotation:** follow-up to move the workflow to a checkout version on a supported Node runtime.
- **MAR hop:** the live N to N+1 hop proof is a Phase 44/50 drill. `powerbrowser/packaging/version-nplus1/` must be bumped above 153.5.1 first.
- **about:license Mozilla binaries sentence:** still deferred to Phase 45/46 (PKG-05 and trademark work).

## Verification

- Task 1 automated verify: exit file `0`, `--version` contains `153.5.1esr`, node check prints `default powerbrowser-default powerbrowser-default`.
- Task 2 automated verify chain: all green, layer 3 included.
- Task 3: owner-reported About-dialog pass, and run 39725128513 concluded success.

## Next Phase Readiness

ROADMAP Phase 40 criterion 1 (final clause: a dispatched run against FIREFOX_153_5_1esr_RELEASE is green), criterion 3's live half (the About dialog links) and the External gate (the owner dispatched with an explicit `tag`) are met. Phase 40 is complete. Phase 41 is planned.

## Self-Check: PASSED

- FOUND: .mozbuild/phase40-smoke.exit (0)
- FOUND: .mozbuild/phase40-layer3.log (layer 3 PASS)
- FOUND: objdir/dist/bin/powerbrowser
- FOUND: 2d4225a (origin/workspace/deploy)
