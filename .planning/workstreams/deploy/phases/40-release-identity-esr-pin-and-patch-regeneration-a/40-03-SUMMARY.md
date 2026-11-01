---
phase: 40-release-identity-esr-pin-and-patch-regeneration-a
plan: 03
subsystem: infra
tags: [release-identity, generator, schema, version-files, verify-platform]
status: complete

requires:
  - phase: 40-01
    provides: "upstreams.firefox_esr_tag pinned to the 153.5.1 esr_RELEASE tag; upstream/config/milestone.txt reads 153.5.1"
  - phase: 40-02
    provides: "patches-regenerated quick rows, after which the new rows are appended"
provides:
  - "Schema key product.revision (integer, required, minimum 1) and an integer branch in validate()"
  - "export releaseIdentity(config) -> frozen { esrVersion, revision, releaseKey }; refuses a non-esr_RELEASE tag naming upstreams.firefox_esr_tag"
  - "TARGETS rows packaging/version/version.txt and packaging/version/release.txt with tracked comparands under powerbrowser/packaging/version/"
  - "Quick rows release-identity and release-identity-self-test (scripts/verify-release-identity.mjs)"
affects: [44 update descriptors, 49 release.yml, 50 first Release, every downstream manifest]

actuals:
  tokens: 9600
  tasks: 3
  commits: 2
plan_head_before: b62c3223e1248f5c5f2a2ba3f2bca271368f6a08
plan_head_after: 35c195d

tech-stack:
  added: []
  patterns:
    - "One-value release metadata files emitted without GENERATED_BANNER, gated by byte-identity against frozen comparands"
    - "Self-test in one mkdtemp git repo with GIT_CONFIG_GLOBAL=/dev/null; manifest copied so tags and keys are derived, never spelled"

key-files:
  created:
    - scripts/verify-release-identity.mjs
    - powerbrowser/packaging/version/version.txt
    - powerbrowser/packaging/version/release.txt
  modified:
    - scripts/lib/config-schema.json
    - configuration.toml
    - scripts/generate.mjs
    - scripts/verify-generated-identity.mjs
    - docs/REBRANDING.md
    - docs/RELEASING.md
    - scripts/verify-platform.sh
    - scripts/verify-downstream-fixture.mjs
    - scripts/verify-extension-pins.mjs
    - scripts/verify-manifest-literals.mjs
    - scripts/verify-trademark-surface.mjs
    - "nine committed fixture manifests (listed below)"

key-decisions:
  - "product.revision is a TOML integer, so check-patch-surface never adds it to the brand-value set"
  - "The version files are release metadata, never a --with-version-file-path input; upstream version_display.txt stays 153.5.1esr so IS_ESR holds"
  - "verify-generated-identity header keeps 'thirty-three' for the Phase 1 hand-written originals and counts three declared exceptions plus thirty-six tracked files read, instead of the plan's 'thirty-five'"

patterns-established:
  - "A release is named v<ESR>-<revision>; every place the identity appears is derived and compared against releaseIdentity()"

duration: 25min
completed: 2026-10-20
---

# Phase 40 Plan 03: Release Identity Summary

**`[product] revision = 1` and the 153.5.1 ESR pin now derive the release key `v153.5.1-1` through an exported `releaseIdentity()`. The key and the ESR version are emitted into two tracked, byte-gated version files. A new quick row requires those files, the upstream milestone, every tracked update.xml and every release-shaped git tag to agree with the derivation.**

## Performance

- **Duration:** about 25 min
- **Completed:** 2026-10-20
- **Tasks:** 3
- **Files modified:** 23

## Accomplishments

- Schema key `product.revision`: `"1"`, `1.5` and `0` each fail naming `product.revision`, and an absent value fails with the standard "is not set" message (checked against a scratch manifest via `resolveConfig`).
- `releaseIdentity()` returns `v154.0-2` for a two-part x.0 tag. It refuses a `_BUILD1` tag naming `upstreams.firefox_esr_tag`.
- `powerbrowser/packaging/version/version.txt` = `153.5.1`; `release.txt` = `v153.5.1-1`. Both were copied once from `generated/` and both are in `EXPECTED` of `verify-generated-identity.mjs`.
- `release-identity` is green on the real tree: "0 tracked update.xml descriptor(s); 0 release tag(s) matching v<ESR>-<revision>". The tree's v1.0..v1.4 tags do not match the release-tag shape.
- `release-identity-self-test` plants seven faults, and each goes red naming its file or tag: version.txt literal, release.txt literal, an off-pin milestone, descriptor appVersion, descriptor displayVersion, HEAD tagged revision+1, and an older commit tagged at the key. Three controls stay green: HEAD tagged as the key, a lower tag on an older commit, and a matching descriptor. A leak check confirms no output contains a checkout path.

## Task Commits

1. **Tasks 1+2: schema key, derivation, version files, fixture churn** - `15eb4d4` (feat). One commit, as the plan requires; `--quick` was green at it.
2. **Task 3: release-identity row, self-test, RELEASING.md** - `35c195d` (feat)

## Fixture files that needed the revision line

Committed manifests (each now has `revision = 1` directly under `[product]`):
- `.planning/milestones/v1.0-phases/07-sourcerer-as-downstream/fixtures/canonical-name/configuration.toml`
- `.planning/milestones/v1.0-phases/07-sourcerer-as-downstream/fixtures/late-sort-name/configuration.toml`
- `.planning/milestones/v1.0-phases/07-sourcerer-as-downstream/fixtures/missing-required-key/configuration.toml` (it still omits only `identity.display_name`)
- `.planning/milestones/v1.0-phases/07-sourcerer-as-downstream/fixtures/non-square-logo/configuration.toml`
- `.planning/milestones/v1.0-phases/07-sourcerer-as-downstream/fixtures/sourcerer-equivalent/configuration.toml`
- `.planning/milestones/v1.0-phases/07-sourcerer-as-downstream/fixtures/spaced-name/configuration.toml`
- `.planning/milestones/v1.1-phases/09-extensions-crash-pipeline/fixtures/local-path-kind/configuration.toml`
- `.planning/milestones/v1.1-phases/09-extensions-crash-pipeline/fixtures/npm-kind/configuration.toml`
- `.planning/milestones/v1.1-phases/09-extensions-crash-pipeline/fixtures/openvsx-pinned/configuration.toml`

Inline manifests: `FIXTURE_BASE` (generate.mjs), and the inline manifests in verify-extension-pins.mjs, verify-manifest-literals.mjs, verify-trademark-surface.mjs and verify-downstream-fixture.mjs. In the verify-downstream-fixture.mjs self-test manifest, the tag became `SELFTEST_9_9_9esr_RELEASE`. No other fixture failed.

## Deviations from Plan

**1. [Rule 1 - Accuracy] verify-generated-identity count words**
- **Found during:** Task 1
- **Issue:** The plan asked for "thirty-three" to become "thirty-five" everywhere. In this header, "thirty-three" counts the Phase 1 hand-written originals. That count is still correct. `EXPECTED` already held 34 paths and now holds 36.
- **Fix:** The Phase 1 count stays "thirty-three". The exception sentence now names three declared exceptions: the carrier and the two version files. The "Honestly --quick" line now says thirty-six tracked files.
- **Commit:** 15eb4d4

**2. [Rule 2 - Coverage] Extra self-test cases**
- Beyond the plan's behaviour list, the self-test adds a release.txt literal plant, an off-pin upstream milestone plant (so step 2 is exercised), and a matching-descriptor control. This gives seven reds and three controls.
- **Commit:** 35c195d

## Observation for later phases

- Step 4 makes any release tag on an earlier commit that is not strictly below the derived key go red. After a release tag `v153.5.1-1` is cut, the next commit on that branch is red until `[product] revision` is bumped or the ESR pin moves. Both the plan and docs/RELEASING.md specify this design. Phase 49/50 release tooling should bump the revision as part of the release, or the post-release commit will fail `--quick`.

## Known Stubs

None.

## Self-Check: PASSED

- FOUND: scripts/verify-release-identity.mjs, powerbrowser/packaging/version/version.txt, powerbrowser/packaging/version/release.txt
- FOUND: 15eb4d4, 35c195d (ancestors of HEAD)
- `scripts/verify-platform.sh --quick` exit 0 at both commits; `git status --porcelain -- powerbrowser scripts` empty after a self-test run
