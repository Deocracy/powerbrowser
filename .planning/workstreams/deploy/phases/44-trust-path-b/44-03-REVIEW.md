---
phase: 44-trust-path-b
plan: 03
reviewed: 2026-10-31T00:00:00Z
depth: standard
range: d96645b4..9bf75657
files_reviewed: 2
files_reviewed_list:
  - scripts/verify-descriptor-monotonic.mjs
  - scripts/verify-platform.sh
findings:
  critical: 1
  warning: 5
  info: 4
  total: 10
status: issues_found
---

# Phase 44 Plan 03: Code Review Report

**Reviewed:** 2026-10-31
**Depth:** standard
**Scope:** commits 233cc0a0 and 9bf75657, read at the committed state (`git show 9bf75657:<path>`). Line numbers refer to that state.

## Summary

The comparison core is correct for a single target: strict `>` on fourteen-digit strings, grouping by exact appVersion, per-Release fail-closed on missing or malformed manifests, a throwing getter turned into FAIL by `guardedGet`, and a page-limit FAIL. Fetching is by `execFileSync` argv (no shell), remote JSON goes through `JSON.parse` and regex-validated fields, and no path is built from remote data except an integer asset id. I found no injection or traversal. The quick self-test runs green and its five plants do go red naming the evidence.

Weaknesses: the registered full-tier row is red under its own driver (verified live), the row checks nothing in any clean environment because its only input is a gitignored directory, the rule compares across BUILD_TARGETs although the target is parsed and discarded, many fail-closed branches have no plant, and the `MOZ_BUILD_DATE` assertion was run once and is not a gate.

## Critical Issues

### BL-01: `descriptor-monotonic` is red when run through the registry driver

**File:** `scripts/verify-platform.sh:5677` (driver env at `scripts/verify-platform.sh:120`)
**Issue:** The driver exports `XDG_CONFIG_HOME` as a fresh mktemp directory. `gh` then finds no `hosts.yml`, so `scripts/verify-platform.sh --only descriptor-monotonic` fails. I reproduced it: `GET repos/Deocracy/powerbrowser/releases?per_page=100 could not be read (... gh auth login)`. Run directly with `node`, the same row passes. Plan Task 2's own `<automated>` verify line runs `--only descriptor-monotonic` and the plan truth says the full-tier row is green; neither holds. The summary reaches PASS only by setting `GH_CONFIG_DIR` by hand, and `requirements-completed` is empty because of related gaps. Every full or `--gate` run now carries one more red row that has nothing to do with the descriptor order. Failing closed is correct. Registering a row that cannot be green under the only driver is the defect.
**Fix:** Fix this once in the driver, since `repo-controls` has the same fault. After line 120, add `[ -n "${GH_CONFIG_DIR:-}" ] || export GH_CONFIG_DIR="${REAL_XDG_CONFIG_HOME:-$HOME/.config}/gh"`. Alternatively, have `ghRead` pass `GH_CONFIG_DIR` through its `env` option. Then re-run `--only descriptor-monotonic` and record the result.

## Warnings

### WR-01: The row compares nothing in any clean checkout (zero-candidate green is not justified)

**File:** `scripts/verify-descriptor-monotonic.mjs:52, 120-122, 232-234`
**Issue:** The only candidate input is `.mozbuild/update-descriptors/`, which is gitignored (`.gitignore:40`) and produced by a manual `--emit`. On CI, on `--gate`, and on any fresh worktree the candidate set is empty, and the row prints PASS. Zero published Releases is justified: with none, no downgrade is possible. Zero candidates is not: it means the thing under test is absent, and the row cannot tell "nothing offered" from "emit step never ran". The argument guard accepts only `--self-test`, so Phase 49's descriptor job cannot point the row at its own output directory. The PASS tail also reads "every candidate buildID is strictly greater..." when there are no candidates.
**Fix:** Accept `--descriptors <dir>`. When the directory is given explicitly, zero descriptors under it is a FAIL. Keep the default-path zero as green only at the quick/dev tier, or print `PASS (vacuous: no candidates)` and drop the "every candidate" clause when `candidates.length === 0`.

### WR-02: The rule is cross-target, and `build_target` is parsed, validated and then discarded

**File:** `scripts/verify-descriptor-monotonic.mjs:115-116, 210-215`
**Issue:** `manifestFields` returns `target`, and the candidate's target is encoded in its path, but the comparison loop filters only on `p.appVersion`. When Darwin or Windows rows land (`PENDING` in `build-update-xml.mjs`), the targets are built at different times. A Darwin descriptor whose buildID is older than the already-published Linux build for the same appVersion goes red, though no Darwin client could be downgraded by it. The check is also blind in the other direction: the candidate's path target is never compared with the descriptor or the manifest. The header says "across every BUILD_TARGET", so this is deliberate, but the update server selects descriptors by BUILD_TARGET and a downgrade only exists within a target. The rule over-fails and the validated `build_target` field is dead data.
**Fix:** Compare only where `p.target === candidateTarget`, with `candidateTarget` taken from the path segment. Add a plant: a different-target older buildID stays green. If cross-target strictness is intended, record the reason in the header and remove the unused field validation.

### WR-03: The descriptor for the build whose own Release is already published fails as "equal"

**File:** `scripts/verify-descriptor-monotonic.mjs:172-192, 212`
**Issue:** The published set is every non-draft Release. A descriptor for build X references the MAR from Release X, so Release X has to be reachable when the descriptor is offered. The moment Release X is non-draft, its manifest has `build_id == candidate buildID`, and `parsed.buildID <= p.buildID` fails it against itself. The row can only go green for a build before its Release is published. The plan and the Phase 49 job do not state that ordering, and the self-test has no plant for it either way. If the descriptor job runs after publish, as the MAR URL implies, this row will permanently block it.
**Fix:** Decide the ordering and encode it. Either exempt the Release the candidate belongs to (match on the tag derived from the MAR URL or on `release.txt`) and compare against all others, or document in the header that the row must run while that Release is still a draft. Add a plant for the self-equal case.

### WR-04: Many fail-closed branches have no plant, contrary to the CLAUDE.md self-test rule

**File:** `scripts/verify-descriptor-monotonic.mjs:322-353`
**Issue:** CLAUDE.md requires a plant for each way a check can go red. Five plants exist. The header and code promise reds that no plant exercises: a non-draft Release with no `release-manifest.json` asset (`:177-180`), the 100-item page limit (`:169`), a non-array or non-JSON Releases response (`:167`), a candidate that does not parse or is unreadable (`:201-203`), a candidate buildID that is not fourteen digits (`:206-209`), `guardedGet`'s `no result` and `no text` branches (`:96-97`), the draft skip (`:173`), and the real `ghRead` helper (the `exec` parameter exists for injection and is never used). Deleting any of those branches leaves the self-test green. `listDescriptors` and `main`'s exit code are also untested. The "green control first" part is done well.
**Fix:** Add plants with needles: release without a manifest asset; 100 releases; `'{}'` as list body; candidate text `'<update>'` and a candidate with `buildID="2026"`; a draft Release with an older manifest, which must stay green and must not be counted; a stub `exec` that throws with `stderr` for `ghRead`.

### WR-05: The `MOZ_BUILD_DATE` grep-assert is a one-off command, not a gate

**File:** `.planning/workstreams/deploy/phases/44-trust-path-b/44-03-SUMMARY.md:111, 141` (no corresponding code in the diff)
**Issue:** T-44-13 is recorded as "mitigate: static grep-assert", but Task 3 produced no commit and no registry row. The grep ran once at plan time. A later patch, `generated/` file, workflow or packaging script can pin `MOZ_BUILD_DATE` and nothing goes red, which is the failure the plan names as the way every later descriptor would fail while looking reproducible. The command is also too narrow. It omits `generated/`, `patches/`, `brand/` and `scripts/*.sh`. `SOURCE_DATE_EPOCH` is a second route to a frozen build date and is not covered. As written, `! grep -rn ... missing-path` returns success when a listed path does not exist, because grep exits 2 and `!` inverts it. All listed paths exist today, so this is latent. It also asserts the absence of a string in files rather than the property (a buildID that advances between builds).
**Fix:** Either append a quick registry row, such as `no-build-date-pin`, that greps a derived file list from `git ls-files` for `MOZ_BUILD_DATE|SOURCE_DATE_EPOCH` outside `inventory/` and this script, with a `--self-test` that plants a hit, or state in the plan and summary that T-44-13 is accepted and unenforced. A tracked-file list also removes the missing-path hole.

## Info

### IN-01: Importing the module runs it and exits the process

**File:** `scripts/verify-descriptor-monotonic.mjs:64-71, 370`
**Issue:** `ghRead`, `manifestFields` and `runChecks` are exported, but the argument guard and `process.exit(main())` run unconditionally at load. I confirmed that `import()` runs `main` and terminates before the import resolves. `verify-repo-controls.mjs:1401` guards with `import.meta.url === pathToFileURL(process.argv[1]).href`. The exports are unusable by any other script, including the Phase 49 job that would want them.
**Fix:** Wrap lines 64-71 and 370 in the same entry-point guard.

### IN-02: `listDescriptors` silently skips symlinked and empty directories

**File:** `scripts/verify-descriptor-monotonic.mjs:123, 127-128`
**Issue:** `isDirectory()` is false for a symlink, so a symlinked channel or target directory is skipped. A target directory without `update.xml` is skipped. Both produce a smaller candidate set with no failure.
**Fix:** Use `statSync(...).isDirectory()`, or report an unexpected entry (a non-directory in the channel tree, or a target directory with no `update.xml`) as a FAIL.

### IN-03: No plausibility bound on a buildID

**File:** `scripts/verify-descriptor-monotonic.mjs:60, 114, 206`
**Issue:** `^\d{14}$` accepts `99999999999999`. A single published manifest, or one offered descriptor, with a far-future buildID makes every later legitimate build for that appVersion fail forever. That is fail-closed, but it can be triggered by one typo and there is no recovery short of deleting the Release (which then drops out of the published set silently).
**Fix:** Reject a buildID that does not parse as a real UTC `%Y%m%d%H%M%S` or that is later than now plus a small skew.

### IN-04: Release list is capped at 100 with a hard FAIL instead of paging

**File:** `scripts/verify-descriptor-monotonic.mjs:54, 169-170`
**Issue:** Fail-closed and honest, but exactly 100 Releases is a false positive, and the row becomes permanently red at the cap. The fix is already named in the message and is cheap.
**Fix:** Use `gh api --paginate --slurp` and flatten the pages. Keep the FAIL for an unreadable page. The `parseUpdateXml` reader in plan 44-02 also reads only the first `<update>` element, so a descriptor with a second, older `<update>` is not seen. That belongs in a 44-02 follow-up.

---

_Reviewed: 2026-10-31_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
