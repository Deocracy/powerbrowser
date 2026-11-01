---
phase: 44-trust-path-b
plan: 03
subsystem: infra
tags: [update-descriptor, buildID, monotonicity, UPD-26, releases, registry, downgrade-refusal]

# Dependency graph
requires:
  - phase: 44-02
    provides: buildUpdateXml (the one shared descriptor emitter), parseUpdateXml, and the <outdir>/<channel>/<BUILD_TARGET>/update.xml descriptor shape
provides:
  - scripts/verify-descriptor-monotonic.mjs: every candidate descriptor buildID strictly greater than every published buildID for the same appVersion, with an in-memory --self-test
  - quick registry row descriptor-monotonic-self-test and full-tier row descriptor-monotonic
affects: [phase 45 packaging (must write build_id and build_target into release-manifest.json), phase 49/50 publish and withdraw (owns the --rollback-to override)]

# Actuals (#2632) - chars/4 over the realized diff; pairs with the plan estimate
actuals:
  tokens: 5595
  tasks: 3
  commits: 2

# Tech tracking
tech-stack:
  added: []
  patterns:
    - one fail-closed gh api helper with the pinned X-GitHub-Api-Version; unreadable input is FAIL naming the endpoint or Release, never SKIP
    - injectable runChecks(root, overrides) with a guarded get, so every plant runs in memory
    - green control first, then planted faults, each red naming its file, Release or endpoint

key-files:
  created:
    - scripts/verify-descriptor-monotonic.mjs
  modified:
    - scripts/verify-platform.sh

key-decisions:
  - "The release-manifest.json contract for this row is { version, build_id, build_target }. The packaging writer does not emit build_id or build_target yet; the row fails closed on any published Release that lacks them."
  - "The candidate descriptor tree defaults to .mozbuild/update-descriptors/<channel>/<BUILD_TARGET>/update.xml. The path is gitignored and matches the --outdir the owner names when emitting."
  - "The repository owner and name come from configuration.toml [urls] release_notes through repoSlug, which is Deocracy/powerbrowser. No slug literal is typed in the script."
  - "A published Release list at the 100-item page limit is a FAIL (possible truncation), not a pass."
  - "--rollback-to is not built. The header records it as the Phase 49/50 override on the withdraw and descriptor path."
  - "The self-test runs fully in memory: no mkdtemp and no write. The plan allowed mkdtemp; in-memory is strictly no-write."

requirements-completed: []  # UPD-26 is NOT closed: the row and self-test are in place, but the packaging writer does not yet emit the manifest fields the row reads. See Issues Encountered.

coverage:
  - id: D1
    description: "A same-version descriptor with an older or equal buildID goes red naming the descriptor, the offered buildID, the published buildID and its Release tag"
    requirement: "UPD-26"
    verification:
      - kind: unit
        ref: "scripts/verify-platform.sh --only descriptor-monotonic-self-test"
        status: pass
    human_judgment: false
  - id: D2
    description: "Zero published Releases is green with a named count line, on the live Releases and in the self-test"
    requirement: "UPD-26"
    verification:
      - kind: other
        ref: "scripts/verify-platform.sh --only descriptor-monotonic (with GH_CONFIG_DIR set; see Issues Encountered)"
        status: pass
    human_judgment: false
  - id: D3
    description: "Publishing a Release whose manifest is malformed, lacks build_id, or cannot be read turns the full-tier row red naming the Release or endpoint"
    requirement: "UPD-26"
    verification:
      - kind: unit
        ref: "scripts/verify-platform.sh --only descriptor-monotonic-self-test (malformed manifest, non-14-digit build_id and throwing getter plants)"
        status: pass
    human_judgment: false
  - id: D4
    description: "Live Releases carry a release-manifest.json with build_id and build_target"
    requirement: "UPD-26"
    verification: []
    human_judgment: true
    rationale: "No Release is published yet (zero non-draft Releases), and the packaging writer does not emit build_id or build_target. Needs the Phase 45 writer change and the first publish to be checked."

# Metrics
duration: not measured (plan start time was not recorded)
completed: 2026-10-31
status: complete
---

# Phase 44 Plan 03: UPD-26 Descriptor buildID Monotonicity Summary

**scripts/verify-descriptor-monotonic.mjs refuses any descriptor whose buildID is not strictly greater than every published buildID for the same appVersion; its quick self-test proves the discrimination in memory and the full-tier row is green on today's empty Release set. The row cannot yet read a real published manifest, because the packaging writer does not emit the fields it needs.**

## Performance

- **Duration:** not measured
- **Tasks:** 3 of 3 complete (Task 3 needed no commit, see below)
- **Commits:** 2 (measured with `git rev-list --count d96645b4..HEAD`)
- **Files:** 1 created, 1 modified

## Accomplishments

- `scripts/verify-descriptor-monotonic.mjs` (new): strict arg guard (only `--self-test`, exit 2 otherwise), injectable `runChecks(root, overrides)` with a `get` and a `descriptors` override, PASS and FAIL lines with counts, and FAIL lines ending `Next step: ...`.
- Live read: every non-draft Release's `release-manifest.json` asset is fetched with `gh api` (pinned `X-GitHub-Api-Version: 2022-11-28`, `Accept: application/octet-stream` for the asset). Fields read: `version` (appVersion), `build_id` (fourteen digits), `build_target` (OS_ABI token). Unknown keys are ignored.
- Candidate set: `.mozbuild/update-descriptors/<channel>/<BUILD_TARGET>/update.xml`, parsed through `parseUpdateXml` from the shared module.
- Rule: a candidate buildID must be strictly greater than every published buildID for the same appVersion. Equal and older both fail, naming the descriptor, both buildIDs and the Release tag. A different appVersion line does not compare.
- Registry rows: quick `descriptor-monotonic-self-test` beside `build-update-xml-self-test`; full-tier `descriptor-monotonic` after `repo-controls`, with the read-only `gh api` honesty comment.

## Task Commits

1. **Task 1: scripts/verify-descriptor-monotonic.mjs with the in-memory self-test** - `233cc0a0` (feat). The plan's Task 1 text says "do not commit" and then "commit it now alone". I read the final intent as: commit the script alone, then the registry edit as its own commit.
2. **Task 2: register descriptor-monotonic and its self-test** - `9bf75657` (test). Two rows only.
3. **Task 3: grep-assert no MOZ_BUILD_DATE pin and record the rollback boundary** - no commit. The assertion passed with no hits, and the boundary is already in the Task 1 header, so there was no edit to land.

## Self-Test Plant Table (`node scripts/verify-descriptor-monotonic.mjs --self-test`, exit 0)

| Case | Kind | Verdict |
| --- | --- | --- |
| Control: candidate 153.5.1 buildID above the published 20261020215955 | control | green |
| Control: zero published Releases | control | green, named count |
| Control: older appVersion (152.9.0) with a newer buildID | control | green (different line) |
| Same-version older buildID (20260101000000) | plant | red, names descriptor, 20260101000000, 20261020215955, v153.5.1-1 |
| Same-version equal buildID | plant | red, names descriptor, buildID, v153.5.1-1 |
| Malformed release-manifest.json (truncated JSON) | plant | red, names v153.5.1-1, release-manifest.json, "not valid JSON" |
| build_id not fourteen digits ("2026-10-20") | plant | red, names v153.5.1-1, build_id, the value |
| Throwing getter on the Releases endpoint | plant | red, names the endpoint and "HTTP 503" |

Fixture descriptors are generated by the shared `buildUpdateXml`, so the self-test checks the descriptor shape the pipeline writes.

## Live Verdicts (full tier)

- `node scripts/verify-descriptor-monotonic.mjs` run directly: PASS -- `0 published buildID(s) across 0 non-draft Release(s); 0 candidate descriptor(s) under .mozbuild/update-descriptors (zero published buildIDs: nothing to compare against) (zero candidate descriptors: nothing offered to compare)`.
- `scripts/verify-platform.sh --only descriptor-monotonic` with `GH_CONFIG_DIR="$HOME/.config/gh"`: PASS, same count line.
- `scripts/verify-platform.sh --only descriptor-monotonic` without `GH_CONFIG_DIR`: FAIL, fail-closed, naming the endpoint (see Issues Encountered).
- With `PATH` stripped of `gh`: FAIL, `GET repos/Deocracy/powerbrowser/releases?per_page=100 could not be read (spawnSync gh ENOENT)`, exit 1. The row never SKIPs.

## Static Gates

- `scripts/scan-brand-residue.mjs` (after `git add`): PASS over 547 files.
- `grep -cE 'PB_MAR|MAR_SIGNING'` on the new script: 0. No signing secret.
- `grep -cE 'FIREFOX_[0-9]'` on the new script: 0. No upstream tag literal.
- `grep -rn 'planning/workstreams/deploy/phases'` on the new script: no hits. The planning-paths row stays green.
- `! grep -rn MOZ_BUILD_DATE scripts/generate.mjs scripts/build-update-xml.mjs .mozconfig powerbrowser/ configuration.toml .github/`: exit 0, no hits. No build-date pin.
- `grep -rn -- '--rollback-to' scripts/*.mjs` outside the boundary comment: no hits. No override implemented.
- The script wrote nothing in the tree: `git status --porcelain -- scripts objdir` empty after the self-test.
- `scripts/verify-platform.sh --quick`: `verify-platform: PASS -- all checks passed`, exit 0, run before each commit. `descriptor-monotonic-self-test: PASS` is in the quick run.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Brand residue from a hardcoded org literal**
- **Found during:** Task 1 brand scan
- **Issue:** the self-test fixture spelled the org name as a literal in the detailsURL, which the brand-token inventory permits only in its listed files.
- **Fix:** the fixture URL is built from `repoSlug` at run time, so the script names no org literal.
- **Commit:** folded into `233cc0a0` before the commit.

### Interpretations and Scope Notes

**2. Owner and repo source.** The brief said to derive the release home from `configuration.toml`. The plan text does not name `DeBIOS-Foundation`, and the script uses `repoSlug`, which reads `[urls] release_notes`. The result is `Deocracy/powerbrowser`. No deviation from the plan text needed.

**3. PASS and FAIL lines.** The plan says "PASS/FAIL lines each ending Next step". I put `Next step:` on every FAIL line and kept PASS lines to the named counts, because a PASS line has no next action. This matches the update-channel precedent.

**4. Self-test uses no mkdtemp.** The plan's artifact list says "mkdtemp only, removed in finally". The fixtures are generated in memory, so nothing is written and nothing needs cleanup.

**5. Commit namespace guard.** The worktree commit protocol's allow-list (`agent-*`, `worktree-agent-*`, `worktree-wf_*`) would refuse `workspace/deploy`. The protected-branch check passed. Both commits are on `workspace/deploy` as the brief directed, the same as 44-02.

**Total deviations:** 1 auto-fixed (Rule 1). Interpretations: 4. Scope notes: 1.

## Issues Encountered

- **UPD-26 stays open: the packaging writer does not emit the manifest fields the row reads.** `powerbrowser/packaging/package-linux.sh` writes `release-manifest.json` with `version`, `release_key`, `update_channel`, `mar_channel_id`, `mar_origin`, `tree`, `host` and `toolchain`. It does not write `build_id` or `build_target`. RELEASING.md describes a manifest that carries the build ID and the BUILD_TARGET, so the doc and the writer disagree. The row fails closed on any non-draft Release missing those fields. The writer change is outside this plan's file list and belongs to the Phase 45 packaging work (PKG-21). Recorded as an unmet truth for the owner.
- **`--only descriptor-monotonic` FAILs under the bare wrapper.** `scripts/verify-platform.sh` exports a temporary `XDG_CONFIG_HOME` at line 120. `gh` then does not find its `hosts.yml`, although the keyring login is valid. The row reports the failure honestly (`gh auth login`), and `repo-controls` fails the same way. With `GH_CONFIG_DIR="$HOME/.config/gh"` the row PASSes. The shared harness fix is out of this plan's file list. The owner should decide whether the wrapper sets `GH_CONFIG_DIR` from `REAL_XDG_CONFIG_HOME` for every live `gh` row.
- **Broken-windows ledger refused.** Both `gsd_run windows append` attempts were refused: `.planning/WINDOWS.md` disagrees with its fenced JSON for rows 10, 11, 19, 22 and 23. The two gaps above are not recorded there. They should be appended once the ledger is repaired: an `unmet-truth` for the manifest writer and a `deviation` for the wrapper `GH_CONFIG_DIR` gap. The ledger was not edited by hand.
- **Plan-base ledger written after the first commit.** The protocol's ledger file (`gsd-plan-head-before-44-03`) was written after the first commit, using the parent `d96645b4`, the reviewer's commit that followed 44-02. `commits: 2` is measured from that base.

## Known Stubs

None. The candidate tree and the published set are read from disk and live Releases. Nothing is hardcoded to a value.

## Threat Flags

None beyond the plan's threat model. The new script reads Release metadata and assets through `gh api`, and it never writes to GitHub. That is the read surface T-44-12 already covers.

## User Setup Required

- Before the first publish: the packaging writer (PKG-21, Phase 45) must emit `build_id` and `build_target` in `release-manifest.json`. Until it does, the full-tier row FAILs naming the Release.
- Optional: decide whether the verify-platform wrapper should set `GH_CONFIG_DIR` for live `gh` rows. Without it, `descriptor-monotonic` and `repo-controls` FAIL under the wrapper.

## Next Phase Readiness

- Phase 49 (first published descriptors) can rely on this row as the downgrade refusal. The `--rollback-to` override is owned by the Phase 49/50 withdraw and descriptor path and is not built here.
- The row PASSes today on zero published Releases, with a named count.

## Self-Check

Checked after writing this file (see the commands below):

- `scripts/verify-descriptor-monotonic.mjs` exists and is tracked in `233cc0a0`.
- `scripts/verify-platform.sh` carries both new rows in `9bf75657`.
- `233cc0a0` and `9bf75657` are ancestors of `HEAD`.

## Self-Check: PASSED

---
*Phase: 44-trust-path-b*
*Completed: 2026-10-31*
