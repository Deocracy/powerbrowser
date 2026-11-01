---
phase: 40-release-identity-esr-pin-and-patch-regeneration-a
fixed_at: 2026-10-22T00:00:00Z
review_path: .planning/workstreams/deploy/phases/40-release-identity-esr-pin-and-patch-regeneration-a/40-REVIEW.md
iteration: 1
findings_in_scope: 8
fixed: 8
skipped: 0
status: all_fixed
---

# Phase 40: Code Review Fix Report

**Fixed at:** 2026-10-22
**Source review:** .planning/workstreams/deploy/phases/40-release-identity-esr-pin-and-patch-regeneration-a/40-REVIEW.md
**Iteration:** 1

**Summary:**
- Findings in scope: 8 (CR-01, WR-01..WR-05, plus IN-06 and IN-07 by owner ruling)
- Fixed: 8
- Skipped: 0
- Not in scope, left open: IN-01, IN-02, IN-03, IN-04, IN-05

Verification ran in the main checkout (`workflow.use_worktrees` is false), on branch
`workspace/deploy`. `scripts/verify-platform.sh --quick` exits 0 after all fixes.

## Fixed Issues

### CR-01: The patch-regeneration gate fails every ESR rebase where a patched upstream file changed

**Files modified:** `scripts/regenerate-patches.sh`, `scripts/rebase-upstream.sh`, `scripts/verify-platform.sh`
**Commit:** cb7fe7c
**Status:** fixed: requires human verification (comparison rule)
**Applied fix:** `--check` compares a file byte for byte only when the tracked patch's pre-image
blob equals the replayed tree's, meaning upstream did not move that file. For a file upstream moved,
it strips the `index`, `@@` and context lines and compares the remaining `+`/`-` lines. A match
passes with a NOTE that tells the operator to regenerate the patch and commit it with the pin bump.
A hand edit still fails in both cases. The normalised comparison is used, not the "tag equals pin"
fallback. The release flow bumps `configuration.toml` first, so the rebase tag always equals the pin,
and that fallback would still go red on a real bump. `rebase-upstream.sh` now holds a gate failure
until the brand scan, the fully-applied classifier and the overlay assertion have run, then exits 1
with a message that names upstream drift as a possible cause. Two self-test cases were added: a clean
`--3way` replay onto a moved upstream (green, NOTE for 010 only) and a hand-edited hunk on that moved
upstream (red).

### WR-01: Write mode silently drops a file from a multi-file patch, and deletions are not supported

**Files modified:** `scripts/regenerate-patches.sh`, `scripts/verify-platform.sh`
**Commit:** 3b71635
**Applied fix:** Paths now come from both sides of every `diff --git a/X b/Y` header, so a deletion
(`+++ /dev/null`) or a rename is regenerated. `check_kept` refuses a regeneration that lost any path
of the tracked patch, names the path, and says it is unchanged in `upstream/`. In write mode the
patch bytes are left unchanged. The check runs in both write mode and `--check`. Two self-test cases
were added: a two-file patch with one file unchanged upstream, which write mode and `--check` both
refuse while naming the file and leaving the bytes unchanged, and a patch that changes one file and
deletes another, which keeps the deletion through write mode and `--check`.

### WR-02: The release-identity tag rule fails `--quick` on every commit after a release and on every branch without the tag

**Files modified:** `scripts/verify-release-identity.mjs`, `scripts/verify-platform.sh`, `docs/RELEASING.md`
**Commit:** 6dfb8da
**Status:** fixed: requires human verification (tag rule)
**Applied fix:** The check now reads tags with `git tag --merged HEAD`. An ancestor tag that equals
the derived key is green. An ancestor tag above the key is still red. A tag at HEAD must still equal
the key. The "key is new" rule was removed from `--quick`, and the header and RELEASING.md now place
it where a tag is created (release.yml / TRAIN-01). Self-test changes: a new red plant (older commit
tagged one revision above the key), and two new controls (older commit tagged at the key; a higher
tag on a commit HEAD does not contain).

### WR-03: The new `github.com` row widens the layer 4 sidecar egress gate, which still uses a presence rule

**Files modified:** `scripts/verify-ng-069-sidecar-egress.mjs` (hash-locked), `scripts/lib/endpoint-verdict.mjs`, `scripts/verify-endpoints.sh`
**Commit:** 71d3807 (own commit)
**Status:** fixed: requires owner re-lock and a live full-tier run
**Applied fix:** Layer 4's live half now fails every host that `violations(allow, seen, { userAction: false })`
returns: a host with no row, a `deny` row, or a `user-initiated` row (`github.com`,
`powerbrowser.org`). The static check of derived hosts keeps its presence rule. Comments in
`endpoint-verdict.mjs` and `verify-endpoints.sh` were updated. The locked hash in the requirements
file is `8f507194...134c`. The file now hashes `33302452...61cfd`, so the owner must re-lock. The row
is full-tier (live clone + browser), so it was not run here. Only `node --check` and a direct
`violations()` call over the real allowlist were run.

### WR-04: A downstream inherits PowerBrowser's About-dialog release-notes and manual-update links

**Files modified:** `scripts/generate.mjs`, `scripts/verify-downstream-fixture.mjs`, `docs/REBRANDING.md`, eight downstream fixture manifests under `.planning/milestones/v1.0-phases/07-*/fixtures/` and `.planning/milestones/v1.1-phases/09-*/fixtures/`
**Commit:** 996e104
**Status:** fixed: requires human verification (refusal condition)
**Applied fix:** The R11 block in `resolveConfig` now also refuses a downstream (`PB_CONFIG_DIR`)
when both of these hold: its identity (the `[identity]` table plus `product.vendor_*`) differs from
the platform's, and its `urls.release_notes` or `urls.homepage` equals the platform's own value,
which is what an omitted key inherits. The message names the key and says in plain words where the
About dialog would send users. The comparison is on the exact value, not the host. A host comparison
would refuse a downstream's own `github.com/<org>/<repo>/releases` page. A same-identity copy is
exempt, which is the shape the ng071/ng073 fixtures use. The generator self-test adds an inherited
case (red, naming both keys) and a same-identity copy (green). The downstream fixtures now state
their own pages, following the R21 precedent for `urls.update`. REBRANDING.md rows describe the
platform and downstream cases. Default output is unchanged: `verify-generated-identity` and
`generate --check` pass.

### WR-05: `verify-update-prefs` checks against a hand-kept forbidden list

**Files modified:** `scripts/verify-update-prefs.mjs`, `scripts/verify-platform.sh`
**Commit:** 4706b69
**Applied fix:** `FORBIDDEN_UPDATE_PREFS` was removed. The owned set is derived as the
`releaseLinkPrefs(config)` names plus `app.update.langpack.enabled`. Any `app.update.*` or
`app.releaseNotesURL*` pref outside that set fails, naming the pref and the variant. The self-test
plants the five UPD-25 prefs plus `app.update.background.enabled`, and every plant goes red.

### IN-06: BUILD.md still describes the policy file as an update-URL mechanism

**Files modified:** `docs/BUILD.md`
**Commit:** b5ba096
**Applied fix:** BUILD.md now names the compiled `MOZ_APPUPDATE_HOST` as the only mechanism. It
states that the 08-04 "layer 3 fails without the policy" observation predates UPD-12: the policy
carried `AppUpdateURL` from 9f4e59e until 119c6b0 removed it.

### IN-07: `product.revision = 1.0` is accepted

**Files modified:** `scripts/generate.mjs`, `docs/REBRANDING.md`
**Commit:** 93e1608
**Applied fix:** `loadLayer` parses the manifest a second time with `integersAsBigInt` and records
each integer-typed setting written as a decimal. `resolveConfig` refuses those settings in plain
words. A self-test plant for `revision = 1.0` was added, and REBRANDING.md names the case.

## Not Fixed (out of scope by owner ruling)

- IN-01: `releaseIdentity()` exits the process from inside library callers
- IN-02: the disposition self-test's green cases pass when the verdict call crashes
- IN-03: the notices depend on the host platform and pick up non-licence files
- IN-04: LICENSING.md repeats Mozilla's binaries statement
- IN-05: the rebase workflow does not check the dispatched tag against the pin or the `esr_RELEASE` shape

---

_Fixed: 2026-10-22_
_Fixer: Claude (gsd-code-fixer)_
_Iteration: 1_
