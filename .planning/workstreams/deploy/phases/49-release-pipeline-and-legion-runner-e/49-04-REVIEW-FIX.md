---
phase: 49-release-pipeline-and-legion-runner-e
plan: 04
fixed_at: 2026-10-31T00:00:00Z
review_path: .planning/workstreams/deploy/phases/49-release-pipeline-and-legion-runner-e/49-04-REVIEW.md
iteration: 1
findings_in_scope: 12
fixed: 10
skipped: 2
status: partial
---

# Phase 49 Plan 04: Code Review Fix Report

**Fixed at:** 2026-10-31
**Source review:** 49-04-REVIEW.md
**Iteration:** 1

**Summary:**
- Findings in scope: 12 (CR-01..03, WR-01..05, IN-01..04)
- Fixed: 10
- Not fixed: 2. CR-02 waits on an owner decision, and its row now fails closed naming that decision. IN-03 is left as the brief allows.

Every fix was committed in this worktree (workspace/deploy) with explicit paths. All verification ran in this
main checkout, not in a separate worktree.

## Fixed Issues

### CR-01: A failed descriptor PUT is swallowed and the descriptor job goes green

**Files modified:** `.github/workflows/release.yml`
**Commit:** af31517e
**Applied fix:** Before the loop, the commit step reads `repos/$REPO` and requires that `full_name` equals the target, compared case-insensitively. That makes a 404 on a descriptor path mean "file absent" and never "repo not visible to this token". If the repo read fails, the step fails closed and names the HTTP status. The PUT now runs as its own command with its exit status checked. On failure the step fails, naming the step, the file, the repo and the HTTP status. On success it requires a 40-hex `commit.sha`, and it requires `content.sha` to equal `git hash-object` of the emitted bytes. The run script was exercised with a fake `gh`. Repo 404, PUT 409 and an empty body each gave exit 1 with the named error, and a good body gave exit 0.

### CR-03: The artifacts expire before the descriptor job can start

**Files modified:** `.github/workflows/release.yml`, `scripts/verify-release-shape.mjs`, `49-04-SUMMARY.md`, `BLOCKED.md`
**Commit:** 8284584d
**Applied fix:**
- `build-linux` uploads the manifest a second time, as the data-only artifact `release-linux-manifest`.
- That artifact and `release-linux-identity` now use `retention-days: 7`.
- `descriptor` and `channel-live` download `release-linux-manifest`.
- `release-linux`, which holds the tarball, the MAR and the manifest that sign-publish reads, keeps retention 1.

The `release-shape` retention rule used to require 1 everywhere, so it needed a change. Its derivation:
- The late jobs are the descriptor-environment job plus every job that needs it.
- The late artifacts are the ones those jobs download.
- A late artifact needs retention of at least `ceil(wait_timer / 1440) + 2`, with `wait_timer` read from `.github/settings/environment-descriptor.json`. That is 3 today.
- A late artifact may carry no `.tar.xz` and no `.mar`.

Three new plants go red: identity retention back to 1, the descriptor downloading `release-linux`, and an environment file with no `wait_timer`. The change is noted in the SUMMARY and in BLOCKED.md item 1. Side effect: the manifest's `host` field (the build machine's name) is now readable as an artifact for 7 days instead of 1.

### WR-01: The form gate checks a different URL than the parser uses

**Files modified:** `scripts/verify-channel-live.mjs`, `scripts/verify-mar-update-hop.mjs`
**Commit:** 8fc88d53
**Applied fix:**
- `descriptorFormProblems` now runs `patchUrlForm` on `parseUpdateXml(text).url`, and the separate regex scan is deleted. `--form-only` and the live row both call it.
- A descriptor with a patch count other than 1 is refused. The parser reads only the first patch, so a second patch URL could otherwise go unjudged.
- `parseUpdateXml`'s `attr()` in the shared parser now matches on a whitespace boundary (`(?:^|\s)NAME="`), so `data-URL=` and `XURL=` are never read as `URL=`.

Three plants go red, live and `--form-only`, before any MAR fetch: a decoy `data-URL="<good>"` after an evil `URL`, the same decoy placed ahead of it, and a second `<patch>` carrying an evil URL. The other parser consumers stay green: `mar-update-hop-self-test`, `build-update-xml-self-test`, `descriptor-monotonic` and `descriptor-monotonic-self-test`.

### WR-02: The channel-live self-test never plants several must-have checks

**Files modified:** `scripts/verify-channel-live.mjs`
**Commit:** 39545339
**Applied fix:** The fake `get` now has plantable answers, `state.latest` and `state.repoXml`. New plants, each red naming the target and the value or naming the endpoint:
- A public descriptor that is not byte-equal to the repo copy. The repo copy is served with one extra byte.
- An appVersion off the manifest.
- A buildID off the manifest.
- An offered version off the latest Release.
- A latest tag off the release_key: two checks, the per-target offered version and the release_key line.
- No published Release (404).

The number of ok lines is listed under Verification.

### WR-03: channel-live runs before the Pages deploy can serve the commit

**Files modified:** `.github/workflows/release.yml`
**Commit:** 9465f980
**Applied fix:** The retry lives in the job step, so the row stays a single pure read. The step makes up to 10 attempts, 60 s apart. It retries only on a red verdict (exit 1); any other exit code stops at once. After the last attempt it fails closed with a `::error::` line that names the next step. Job `timeout-minutes` went from 15 to 30. Tested with a fake `node`: `0` gave 1 run and exit 0, `1 1 0` gave 3 runs and exit 0, `2` gave 1 run and exit 2, and all-red gave 10 runs and exit 1.

### WR-04: The verifier exemption covers whole files

**Files modified:** `scripts/verify-update-download-host.mjs`
**Commit:** fdaabd44
**Applied fix:**
- In a `scripts/verify-*.mjs` file, only the lines from `function selfTest(` (or `async function selfTest(`) to the first column-0 `}` are exempt. The rest of each verifier is now scanned.
- A tree survey before the change found 6 hits across 185 verifiers, all inside a selfTest function, so the baseline stays green.
- New plants go red: a non-verifier script `scripts/build-planted-descriptor.mjs` carrying the github form, which is the plan's required plant, and a verifier carrying the form outside its selfTest.
- The verifier control now carries the form inside its selfTest and stays green.
- The region end is marked with a `shortcut:` comment, because it relies on the house brace style.

### WR-05: Token scope and commit target derived separately

**Files modified:** `.github/workflows/release.yml`
**Commit:** e70392d4
**Applied fix:**
- A new step, `updates_repo`, validates `GITHUB_REPOSITORY` as owner/repo and sets `UPDATES_REPO="$GITHUB_REPOSITORY-updates"` once. It writes `full`, `owner` and `name` outputs.
- The token step uses `owner: ${{ steps.updates_repo.outputs.owner }}` and `repositories: ${{ steps.updates_repo.outputs.name }}`.
- The commit step takes `REPO` from `steps.updates_repo.outputs.full`.
- Consequence: the plan's acceptance grep `grep -q 'repositories: powerbrowser-updates'` no longer matches, by design. The literal survives only in the comment above the step.

### IN-01: Untrusted manifest values echoed raw into `::error::` lines

**Files modified:** `.github/workflows/release.yml`
**Commit:** 5ba7f3e9
**Applied fix:** Each `::error::` line that showed a manifest value now prints it with `jq -c`, JSON-quoted, so an embedded newline stays escaped. This covers release_key (sign-publish and descriptor), update_channel (sign-publish), and mar_origin and update_channel (descriptor and channel-live). The comparisons still use the `jq -r` values. The release-shape anchors are unchanged.

### IN-02: The treeAuthority comment states the opposite of the code

**Files modified:** `scripts/verify-channel-live.mjs`
**Commit:** 7c42c59e
**Applied fix:** The comment now says update_url is judged whenever the manifest carries it, `--form-only` included. 49-04-SUMMARY.md deviation 5a still says "the descriptor job never reads update_url". That sentence is historical and was left as it is. This note corrects it.

### IN-04: GitHub's other signed asset host is not named

**Files modified:** `scripts/verify-update-download-host.mjs`, `scripts/verify-channel-live.mjs`
**Commit:** 6e5b6b3c
**Applied fix:** The guard's `RELEASE_ASSETS` is now `(?:release-assets|objects)\.githubusercontent\.com`, and `patchUrlForm` refuses `objects.githubusercontent.com` as a GitHub signed asset URL. Each got a plant that goes red.

Registry row comments for the new plants: commit 249378b6, `scripts/verify-platform.sh`, comments only.

## Not Fixed

### CR-02: release-manifest.json is never a Release asset

**File:** `.github/workflows/release.yml:668`, `scripts/verify-descriptor-monotonic.mjs`, full-tier row `channel-live`
**Reason:** This is deferred to the owner, as the brief requires. Publishing the manifest exposes its `host` field, which names the build machine. BLOCKED.md section "49-04" item 2 is left as it was.
**Partial change (commit b3d376d4):** Without `--manifest`, the full-tier `channel-live` row now fails closed when the latest Release has no `release-manifest.json` asset. Its message names the asset and points at BLOCKED.md section "49-04" item 2. A plant proves this, and the plant also checks that BLOCKED.md still has its 49-04 section. `descriptor-monotonic` in the descriptor job still goes red on every published Release until the owner decides.

### IN-03: The manifest-versus-tree agreement exists three times

**File:** `.github/workflows/release.yml` (two shell steps), `scripts/verify-channel-live.mjs` (`treeAuthority`)
**Reason:** The copies are in two different files, so per the brief they were left in place. The reviewer's fix is to delete both shell steps, because `treeAuthority` already refuses a disagreeing manifest by name before any commit or request. That fix is still open. Its error lines were hardened under IN-01.

## Verification

All runs were in the main checkout `/home/chris/gsd-workspaces/deploy/Power-Browser`.

- `node scripts/verify-channel-live.mjs --self-test`: PASS, 25 ok lines (baseline plus 24 plants; the plan text says 10 and the pre-fix count was 13).
- `node scripts/verify-update-download-host.mjs --self-test`: PASS, 11 ok lines (baseline, 7 plants, 3 controls; the plan text says 8).
- `node scripts/verify-release-shape.mjs --self-test`: PASS, 44 workflow faults plus 3 mar_origin faults.
- `scripts/verify-platform.sh --only release-shape`: `verify-platform: PASS -- all checks passed`.
- `node scripts/scan-brand-residue.mjs`: PASS.
- `node scripts/verify-channel-live.mjs` (full tier): FAIL, "found no published Release". This is red by design until the first release.
- `scripts/verify-platform.sh --quick`: `verify-platform: PASS -- all checks passed` (258 rows PASS, none FAIL; `fixer-isolate-self-test` PASS on the first run, so no rerun was needed).

---

_Fixed: 2026-10-31_
_Fixer: Claude (gsd-code-fixer)_
_Iteration: 1_
