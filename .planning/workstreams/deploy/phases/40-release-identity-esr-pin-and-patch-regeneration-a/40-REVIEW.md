---
phase: 40-release-identity-esr-pin-and-patch-regeneration-a
reviewed: 2026-10-22T00:00:00Z
depth: standard
files_reviewed: 37
files_reviewed_list:
  - .github/workflows/rebase-upstream.yml
  - .mozconfig
  - LICENSING.md
  - README.md
  - THIRD-PARTY-NOTICES.txt
  - configuration.toml
  - docs/BUILD.md
  - docs/REBRANDING.md
  - docs/RELEASING.md
  - inventory/brand-tokens.json
  - powerbrowser/branding/dev/pref/firefox-branding.js
  - powerbrowser/branding/release/pref/firefox-branding.js
  - powerbrowser/distribution/policies.json
  - powerbrowser/endpoint-allowlist.json
  - powerbrowser/packaging/version/release.txt
  - powerbrowser/packaging/version/version.txt
  - scripts/generate-licensing.mjs
  - scripts/generate.mjs
  - scripts/lib/config-schema.json
  - scripts/lib/endpoint-verdict.mjs
  - scripts/rebase-upstream.sh
  - scripts/regenerate-patches.sh
  - scripts/verify-downstream-fixture.mjs
  - scripts/verify-endpoints.sh
  - scripts/verify-extension-pins.mjs
  - scripts/verify-generated-identity.mjs
  - scripts/verify-manifest-literals.mjs
  - scripts/verify-mar-update-hop.mjs
  - scripts/verify-ng-064-update-url.mjs
  - scripts/verify-platform.sh
  - scripts/verify-release-identity.mjs
  - scripts/verify-theia-endpoints.mjs
  - scripts/verify-trademark-surface.mjs
  - scripts/verify-update-channel.mjs
  - scripts/verify-update-prefs.mjs
  - scripts/verify-upstream-pins.mjs
  - scripts/verify-webextensions.mjs
findings:
  critical: 1
  warning: 5
  info: 7
  total: 13
status: issues_found
---

# Phase 40: Code Review Report

**Reviewed:** 2026-10-22
**Depth:** standard
**Files Reviewed:** 37
**Status:** issues_found

## Summary

Scope: `git diff ad9fc4d^..ed80f96`, excluding `.planning/` and `ledger/`. Changed source covers the
callable rebase workflow, `regenerate-patches.sh` and its use in `rebase-upstream.sh`, the release identity
(`releaseIdentity()`, `product.revision`, the version files, `verify-release-identity.mjs`), the update
channel constant and `verify-update-channel.mjs`, the shared endpoint verdict and the `user-initiated`
disposition, the About-dialog link prefs and `verify-update-prefs.mjs`, `generate-licensing.mjs`, and the
new `verify-platform.sh` rows.

Scope notes:
- `patches/` has no change in this range. The four tracked patches pass `regenerate-patches.sh --check`
  against the current `upstream/` (FIREFOX_153_5_1esr).
- `plan-gate.py --stream` has no change in this range either, so it was not reviewed.

Checks run during review: `regenerate-patches.sh --check` and `--self-test`, `verify-release-identity.mjs`
and `--self-test`, `verify-update-channel.mjs`, `verify-update-prefs.mjs --self-test` and
`verify-endpoints.sh --disposition-self-test`. All exited 0. Two findings were reproduced in throwaway
fixture repos in the scratchpad: CR-01 and WR-01.

The main defect is CR-01. The new patch-regeneration gate runs inside `rebase-upstream.sh`. Because of
that, the rebase workflow fails on any ESR bump that changes a patched file, even when the patches
replay cleanly. Its error message then tells the operator that someone hand-edited a hunk.

## Critical Issues

### CR-01: The patch-regeneration gate fails every ESR rebase where a patched upstream file changed

**File:** `scripts/rebase-upstream.sh:127-133`, `scripts/regenerate-patches.sh:89-91`
**Issue:** `rebase-upstream.sh --tag <NEW>` now runs `regenerate-patches.sh --check` right after
`apply-patches.sh`. The check byte-compares each tracked patch with `git diff HEAD` of the replayed tree.
A clean `--3way` replay onto a new tag still changes two things in a patch:
- the `index <pre>..<post>` line, because the pre-image blob is the new upstream blob;
- the `@@` line numbers and context, whenever upstream edited the file.

The tracked patch therefore never equals its regeneration after a real ESR bump that touches any of the
five patched files (`browser/moz.configure`, `browser/moz.build`, the two NSIS files and
`toolkit/mozapps/update/updater/moz.build`).

Effects:
- The rebase workflow, which the release train is meant to call with a new tag, goes red at step 4a.
- The message reads "a hunk was edited by hand, or upstream/ is not the applied pin", so it sends the
  operator to look for a hand edit that does not exist.
- The failure exits before the residual-brand scan, the fully-applied classifier and the overlay
  assertion, so those post-replay gates never report on the new tag.

The only passing dispatch so far (40-08) used the tag the patches were already regenerated against, so
it could not show this.

Reproduced in a fixture:
1. Commit file v1 and produce the patch with `regenerate_one`.
2. Commit an unrelated upstream line change as "v2".
3. `git apply --3way` reports `Applied patch to 'f.txt' cleanly.`
4. `regenerate-patches.sh --check` exits 1 with the "edited by hand" message.

The header comment in `rebase-upstream.yml:1-5` says "an ESR bump edits configuration.toml alone". That
cannot hold while this gate runs on the new tag.

**Fix:** Keep AUTO-10, but scope it to what it is meant to detect.

Option 1: in `rebase-upstream.sh`, run `--check` only when `NEW_TAG` equals the manifest pin. When the
tag differs, report that the patches need regenerating rather than failing:
```bash
PIN="$(sed -n 's/^FIREFOX_ESR_TAG=//p' "$REPO_ROOT/generated/upstream-pins.env")"
if [ "$NEW_TAG" = "$PIN" ]; then
  "$REPO_ROOT/scripts/regenerate-patches.sh" --check || { echo "...hand-edited patch..." >&2; exit 1; }
else
  echo "rebase-upstream: NOTE -- $NEW_TAG is not the manifest pin; run scripts/regenerate-patches.sh and commit the regenerated patches with the pin bump"
fi
```

Option 2: compare patches with the `index` line and `@@` offsets normalised, so that only hunk-body
drift (the silent no-op case) goes red.

With either option, run the brand scan and the classifier before the regeneration gate, and change the
failure message so it names upstream drift as a possible cause.

## Warnings

### WR-01: Write mode silently drops a file from a multi-file patch, and deletions are not supported

**File:** `scripts/regenerate-patches.sh:36-38`, `scripts/regenerate-patches.sh:111-114`
**Issue:** `run_write` checks two things only: the whole regeneration is non-empty, and it starts with
`diff --git a/`.

If one of a patch's paths has no change in `upstream/`, its hunks disappear from the rewritten patch
without warning. That happens when:
- a hunk was resolved away during a `--3way` conflict, or
- `apply-patches.sh` missed one file of a multi-file patch. Its non-vacuity assertion is per patch, not
  per file.

Reproduced in a fixture: a two-file `040.patch`, with `b.txt` left pristine. Write mode printed
`rewrote 040.patch`, exited 0, and the result contains only `+++ b/a.txt`.

`040-powerbrowser-nsis.patch` is the real two-file patch this applies to.

Separately, `patch_paths` reads only `+++ b/` lines. A patch that deletes a file (`+++ /dev/null`) either:
- fails preflight with "no '+++ b/' target path", or
- if mixed with other files, loses the deletion in write mode.

**Fix:** In `run_write`, require that the set of `+++ b/` paths in each regeneration equals the original
set. Refuse with "regenerating 040-...patch dropped <path>; <path> is unchanged in upstream/". Also
derive paths from `diff --git a/X b/Y` headers so that deletions and renames are covered. Add a
dropped-path plant to `--self-test`.

### WR-02: The release-identity tag rule fails `--quick` on every commit after a release and on every branch without the tag

**File:** `scripts/verify-release-identity.mjs:157-176`
**Issue:** Every release-shaped tag that is not at HEAD must compare strictly lower than the derived key.

Scenario: release `v153.5.1-1` is tagged on main at commit C. The `--quick` commit gate then goes red
with "is on an earlier commit but is not lower than the derived" in three cases:
1. Any later commit on main, including a docs-only commit.
2. Any worktree branch that does not contain C. Tags are shared across worktrees, so this covers
   `workspace/pba` and `workspace/deploy`.
3. Any checkout of an older commit.

The only way to turn it green is to bump `revision` before another release is planned. That contradicts
`configuration.toml:36-38` ("increase it for an out-of-band rebuild on the same ESR"). CI's
`verify.yml` runs `--quick` on every push of every branch, so every concurrent workstream turns red the
moment the first release is tagged.

**Fix:**
- Limit the comparison to tags reachable from HEAD: `git tag --merged HEAD`.
- In `--quick`, allow equality for an ancestor tag.
- Move the "derived key must be new" assertion to the point where a tag is created (`release.yml` /
  TRAIN-01). The note at lines 26-28 already puts the published-release comparison there.
- Add a self-test case: a commit on top of a tagged commit with an unchanged manifest stays green.

### WR-03: The new `github.com` row widens the layer 4 sidecar egress gate, which still uses a presence rule

**File:** `scripts/verify-ng-069-sidecar-egress.mjs:43-44`, `powerbrowser/endpoint-allowlist.json:89-94`
**Issue:** Layer 4 treats a host as covered when it has any allowlist row, whatever its disposition.
`endpoint-verdict.mjs:3-6` records this as deferred.

Before Phase 40, `github.com` had no row. If the sidecar resolved `github.com` during the probe session,
layer 4 went red. Phase 40 adds `github.com` and keeps `powerbrowser.org` as `user-initiated` rows. Now
an unattended sidecar fetch of either host, such as a Theia plugin or welcome-widget request, passes
layer 4. Under UPD-33 that case must fail exactly like `deny`.

This is a regression in what the gate catches, introduced by this phase's data change rather than by
the deferred code.

**Fix:** Have layer 4 call the shared rule:
```js
import { violations } from './lib/endpoint-verdict.mjs';
for (const h of violations(allow, seen, { userAction: false })) failures.push(`the sidecar resolved ${h} unattended, which the allowlist does not allow`);
```
Keep the existing static presence check for derived hosts. If this cannot land now, record it as a
ledger item tied to the github.com row.

### WR-04: A downstream inherits PowerBrowser's About-dialog release-notes and manual-update links

**File:** `scripts/generate.mjs:2658-2668`, `scripts/generate.mjs:4181-4203`, `docs/REBRANDING.md:284`, `docs/REBRANDING.md:287`
**Issue:** `releaseLinkPrefs` reads the merged config. A downstream manifest (`PB_CONFIG_DIR`) that omits
`urls.release_notes` and `urls.homepage` therefore inherits the platform values:
- `https://github.com/DeBIOS-Foundation/powerbrowser/releases`
- `https://powerbrowser.org`

The generator's own self-test asserts this inheritance at `generate.mjs:5381`. The downstream's About
dialog then sends its users to PowerBrowser's releases page, and the "download manually" fallback
(`app.update.url.manual`) sends them to PowerBrowser's site. This is a cross-brand leak of the same kind
R11 refuses for `urls.update`, but nothing refuses it here. Only a D-08 stderr echo mentions it, and
`verify-theia-endpoints` check 3 does not flag it because the host is unchanged.

REBRANDING.md says an omitted key yields `about:blank` or an empty link. That is true only for the
platform manifest.

**Fix:** Extend the R11 block in `resolveConfig`. When `downstreamPath !== undefined` and
`urls.release_notes` or `urls.homepage` has the platform's host, push a named failure, or mask both keys
so they fall back to `about:blank` / `""`. Then correct the two REBRANDING.md rows to describe the
downstream case.

### WR-05: `verify-update-prefs` checks against a hand-kept forbidden list

**File:** `scripts/verify-update-prefs.mjs:67-75`
**Issue:** `FORBIDDEN_UPDATE_PREFS` lists five prefs. CLAUDE.md says "derive from the tree and compare;
do not hand-keep an expectation list". A hand-kept list can only catch the drift its author thought of.

Scenario: someone adds one of these to `FIREFOX_BRANDING_BASE_LINES`:
- `pref("app.update.background.enabled", false);`
- `pref("app.update.checkInstallTime", false);`
- `pref("app.update.service.enabled", false);`

Each overrides upstream update behaviour, which UPD-25 forbids, and `update-prefs` stays green. The
self-test only plants the five listed names, so it cannot show the gap.

**Fix:** Invert the rule. Any `app.update.*` pref the emitter sets that is not in the set the generator
owns fails, naming the pref. Derive that owned set from `releaseLinkPrefs(config)` names plus
`app.update.langpack.enabled`. Add a plant for an unlisted `app.update.*` pref.

## Info

### IN-01: `releaseIdentity()` exits the process from inside library callers

**File:** `scripts/generate.mjs:2787-2799`, `scripts/verify-release-identity.mjs:97`, `scripts/verify-release-identity.mjs:210`
**Issue:** When the pin is not an `esr_RELEASE` tag, `releaseIdentity` calls `report()`, which runs
`process.exit(1)`. `verify-release-identity` then dies with a `generate: FAIL` prefix instead of its own
`release-identity: FAIL` line. Its `--self-test` exits from inside `try`, so the `finally` block that
removes the mkdtemp repo never runs.
**Fix:** Return `{ failures }` or throw, and let each caller report.

### IN-02: The disposition self-test's green cases pass when the verdict call crashes

**File:** `scripts/verify-endpoints.sh:643-654`
**Issue:** `got="$(plant ... | endpoint_violations ...)"` ignores the pipeline status. If node fails, for
example on an import error in `endpoint-verdict.mjs`, `got` is empty and the two green cases report
PASS. The red cases still go red, so the row as a whole still fails, but two of its lines report
something untrue.
**Fix:** Run `set -o pipefail` inside `verdict`, or capture the node exit status, and treat a non-zero
status as FAIL.

### IN-03: The notices depend on the host platform and pick up non-licence files

**File:** `scripts/generate-licensing.mjs:127`, `scripts/generate-licensing.mjs:174-175`
**Issue:**
- Installed `optionalDependencies` are platform-specific (for example `@esbuild/linux-x64`, or a
  `*-linux-x64-gnu` versus `-musl` variant). A developer on arm64 or musl regenerates a different
  THIRD-PARTY-NOTICES.txt, and the `licensing` row goes red for them.
- `LICENCE_FILE = /^(licen[cs]e|copying|notice)/i` also matches source files such as `notice.js` or
  `license-checker.js` in a package root.
**Fix:** Restrict the filename match to known licence-file names and extensions (`.md`, `.txt`, none).
Document that the notices are derived for linux-x64-glibc, or exclude non-host optional packages
explicitly.

### IN-04: The shipped LICENSING.md says its own notices contain a statement that is not true for this product

**File:** `scripts/generate-licensing.mjs:343`, `LICENSING.md`
**Issue:** The generated text says the about:license section opens with Mozilla's statement that the
Mozilla Project made the binaries available, and that this does not describe PowerBrowser binaries.
Release builds ship this. Replacing the statement is deferred to "a later phase" without a ledger
reference.
**Fix:** Track the replacement as a release-blocking ledger item, or strip that paragraph from the
generated Gecko section now.

### IN-05: The rebase workflow does not check the dispatched tag against the manifest pin or the `esr_RELEASE` shape

**File:** `.github/workflows/rebase-upstream.yml:24-35`, `.github/workflows/rebase-upstream.yml:128-131`
**Issue:** The generate and identity steps validate `configuration.toml`'s pin, but the replay targets
`inputs.tag`. A `_BUILDn` candidate, or any tag other than the pin, replays and reports green.
REBRANDING.md says releases come only from `*esr_RELEASE` tags. Nothing in the run log states which pin
the tree carried, compared with the tag that was replayed.
**Fix:** Echo both values in the run log. If the workflow is meant to verify the pinned tag only,
require `inputs.tag` to equal the pin.

### IN-06: BUILD.md still describes the policy file as an update-URL mechanism

**File:** `docs/BUILD.md:803-806`, `docs/BUILD.md:818-820`
**Issue:**
- Line 805 says "The policy file and the compiled `application.ini` URL above are the only mechanisms".
- Line 818 says layer 3 "fails without" the fork policy.

Both statements are false after UPD-12, because `policies.json` carries no `AppUpdateURL`. An operator
debugging layer 3 would look for a cause that no longer exists.
**Fix:** Say that the compiled `MOZ_APPUPDATE_HOST` is the only mechanism, and drop the claim that
layer 3 depends on the policy.

### IN-07: `product.revision = 1.0` is accepted

**File:** `scripts/generate.mjs:1030-1037`
**Issue:** TOML `1.0` parses to the JavaScript number `1`, and `Number.isInteger(1)` is true. A float is
therefore accepted, although REBRANDING.md says a fractional value is refused. This has no
release-identity impact, because `1.0` and `1` give the same key.
**Fix:** Leave the code as is, or make the docs say "a value that is not a whole number is refused".

---

_Reviewed: 2026-10-22_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
