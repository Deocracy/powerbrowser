---
phase: 44-trust-path-b
fixed_at: 2026-10-31T00:00:00Z
review_path: .planning/workstreams/deploy/phases/44-trust-path-b/44-03-REVIEW.md
iteration: 1
findings_in_scope: 10
fixed: 10
skipped: 0
status: all_fixed
---

# Phase 44 Plan 03: Code Review Fix Report

**Source review:** 44-03-REVIEW.md (line numbers at 9bf75657). **Scope:** BL-01, WR-01..WR-05, IN-01..IN-04.
**Tree at start:** bc9d8e03 (after the 44-02 fixer). **Verification ran in:** the main checkout (no worktree).
Before every commit `scripts/verify-platform.sh --quick` ended `verify-platform: PASS`, with one exception recorded
under Notes (WR-03). Final `--quick` on e5e997fd: PASS, including the two new `no-build-date-pin` rows.

## Fixed Issues

| Finding | Outcome | Commit |
|---------|---------|--------|
| BL-01 | fixed | 3cf50e81 |
| IN-01 | fixed | dc9534b3 |
| WR-01 | fixed | eacea128 |
| WR-02 | fixed | 08283cdf |
| WR-03 | fixed: requires human verification (ordering decision) | e71457e7 |
| IN-02 | fixed | 64ada3e0 |
| IN-03 | fixed | 8894da0c |
| IN-04 | fixed | da4bb54b |
| WR-04 | fixed (plants also in eacea128, 64ada3e0, 8894da0c, da4bb54b) | fb1a0995 |
| WR-05 | fixed | e5e997fd |

### BL-01: row red under its own driver
`scripts/verify-platform.sh`: after the `XDG_CONFIG_HOME` override, export `GH_CONFIG_DIR` to
`${REAL_XDG_CONFIG_HOME:-$HOME/.config}/gh` only when that directory exists and the caller set no `GH_CONFIG_DIR`.
Only the path is exported; no token is read, copied or logged. Before: `--only descriptor-monotonic` FAIL with
`gh auth login`. After: exit 0 (see WR-01 for the verdict line). `--only repo-controls` no longer reports the auth
error either.

### IN-01: import ran main and exited
Realpath `DIRECT_RUN` guard (the hop gate's pattern) around argument handling and the exit. The self-test imports
the module in a child process and requires it to resolve with `runChecks` and print nothing else; with the guard
removed that check goes red.

### WR-01: zero candidates silently green
`--descriptors <dir>` added (the Phase 49 descriptor job passes its own output). An explicit tree that is absent or
holds zero descriptors is a FAIL. Zero candidates under the default gitignored tree prints
`descriptor-monotonic: SKIP -- ... no candidate descriptor exists, so no offered buildID was compared. Next step: ...`
and exits 0; the PASS line now reads "each of the N candidate buildID(s)" and is printed only when N > 0. Zero
published Releases stays a PASS by named count. `verdict()` is exported and planted; the self-test reads a real
mkdtemp tree. The full-tier row comment states the SKIP and the `--descriptors` FAIL.

### WR-02: cross-target comparison
The candidate's target is its `<BUILD_TARGET>` directory; a candidate outside an OS_ABI directory is a FAIL; only
published builds with the same appVersion and `build_target` compare. The header records why (the server selects by
BUILD_TARGET). Plants: an older buildID on another target stays green; a misplaced candidate is red.

### WR-03: own Release fails as equal
The candidate's own Release is the tag in its patch URL (`<mar_origin>/<tag>/<asset>`, the shape build-update-xml.mjs
emits since bcab2156). When that Release is published, it is checked for identity, not order: its manifest must carry
the candidate's appVersion, buildID and target exactly, else a FAIL naming both sides. Every other Release keeps the
strict rule. So the descriptor job may run before or after its own Release is published. Plants: own Release published
with the same build is green; differing build_id or build_target is red; equal to an older Release that is not its own
is red. **Human check:** this encodes "before or after publish"; if Phase 49 must instead run only while the Release is
a draft, the exemption should become a FAIL.

### IN-02: symlinked and hollow directories skipped
`statSync` follows symlinks; a non-directory where a channel or target directory belongs, and a target directory with
no `update.xml`, are FAILs naming the path. Plants on mkdtemp trees for each.

### IN-03: no plausibility bound on a buildID
`buildIdProblem()` requires a real UTC `%Y%m%d%H%M%S` date no later than now plus one day (Gecko stamps local time),
for published manifests and candidates. The self-test runs on a fixed clock. Plants: a `99999999999999` manifest, a
month-13 candidate, a next-week candidate.

### IN-04: 100-Release cap
`ghRead` takes `{ paginate: true }` and adds `gh api --paginate --slurp`; the row requires an array of page arrays
and flattens it. The page-limit FAIL is gone. Plants: a regression on page two, an object body, a non-array page; a
stub-exec control proves the list read pages with the pinned API version. The `parseUpdateXml` first-`<update>` limit
the reviewer named belongs to a 44-02 follow-up and was not touched.

### WR-04: unplanted fail-closed branches
Plants for: non-draft Release with no manifest asset, unparsable and unreadable candidate, candidate buildID `2026`,
getter returning `null`, getter answering ok with non-string text, gh failing with stderr through the real `ghRead`,
plus a control that a draft Release with a newer manifest is neither read nor counted. Deleting the draft skip or
either `guardedGet` branch was mutation-checked red. Totals: 22 in-memory and 4 on-disk planted faults, each red
naming its file, Release or endpoint.

### WR-05: MOZ_BUILD_DATE assert was not a gate
New `scripts/verify-no-build-date-pin.mjs`, quick rows `no-build-date-pin` and `no-build-date-pin-self-test`. It scans
every tracked file outside `.planning/` (`git ls-files` at check time) plus `generated/` on disk for
`MOZ_BUILD_DATE` or `SOURCE_DATE_EPOCH`, failing naming file and line. Each listed surface (generate.mjs,
build-update-xml.mjs, .mozconfig, configuration.toml, powerbrowser/, .github/, patches/, brand/, scripts/*.sh,
generated/) must contribute a scanned file, else FAIL. Live: 630 files, PASS; a pin appended to `.mozconfig` went red
naming `.mozconfig:19` (reverted).

## Notes

- **WR-03 commit preceded a red `--quick`.** The run before e71457e7 failed only `fixer-isolate-self-test`
  (`mount: .../x.sock: mount point does not exist`, a socket race in `scripts/fixer-isolate.sh`, untouched here); a
  shell chaining mistake committed anyway. That row then passed 2 of 3 isolated reruns, and a full `--quick` on the
  committed e71457e7 tree passed. The flake is pre-existing and unrelated to this plan.
- **generated/ absent is a note, not a FAIL.** It is git-ignored, so every fresh clone lacks it; the driver's
  generate-check precedent made a fresh-clone FAIL a defect. It is a pure function of scanned inputs. A present but
  empty `generated/` is a FAIL.
- **Future legitimate pin.** The S7 macOS draft plan sets one shared per-push build date across targets. That row
  will go red until the plan narrows this check with a reason; the FAIL text says so.
- **Driver summary shows PASS for a SKIP line.** The driver verdict is the exit code; the row's own line reads SKIP.
- `--only descriptor-monotonic` on the final tree: exit 0, `descriptor-monotonic: SKIP -- 0 published buildID(s)
  across 0 non-draft Release(s); 0 candidate descriptor(s) ...`; summary `verify-platform: PASS`. Read-only gh calls only.

---

_Fixer: Claude (gsd-code-fixer)_
_Iteration: 1_
