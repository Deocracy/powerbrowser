---
phase: 40-release-identity-esr-pin-and-patch-regeneration-a
verified: 2026-10-22T16:08:03Z
status: passed
score: 70/73 must-haves verified (5/5 roadmap success criteria; 65/68 plan truths; 3 backstop truths insufficient_spec)
covered_files: [".github/workflows/rebase-upstream.yml", ".mozconfig", ".planning/workstreams/deploy/phases/40-release-identity-esr-pin-and-patch-regeneration-a/40-01-PLAN.md", ".planning/workstreams/deploy/phases/40-release-identity-esr-pin-and-patch-regeneration-a/40-01-SUMMARY.md", ".planning/workstreams/deploy/phases/40-release-identity-esr-pin-and-patch-regeneration-a/40-02-PLAN.md", ".planning/workstreams/deploy/phases/40-release-identity-esr-pin-and-patch-regeneration-a/40-02-SUMMARY.md", ".planning/workstreams/deploy/phases/40-release-identity-esr-pin-and-patch-regeneration-a/40-03-PLAN.md", ".planning/workstreams/deploy/phases/40-release-identity-esr-pin-and-patch-regeneration-a/40-03-SUMMARY.md", ".planning/workstreams/deploy/phases/40-release-identity-esr-pin-and-patch-regeneration-a/40-04-PLAN.md", ".planning/workstreams/deploy/phases/40-release-identity-esr-pin-and-patch-regeneration-a/40-04-SUMMARY.md", ".planning/workstreams/deploy/phases/40-release-identity-esr-pin-and-patch-regeneration-a/40-05-PLAN.md", ".planning/workstreams/deploy/phases/40-release-identity-esr-pin-and-patch-regeneration-a/40-05-SUMMARY.md", ".planning/workstreams/deploy/phases/40-release-identity-esr-pin-and-patch-regeneration-a/40-06-PLAN.md", ".planning/workstreams/deploy/phases/40-release-identity-esr-pin-and-patch-regeneration-a/40-06-SUMMARY.md", ".planning/workstreams/deploy/phases/40-release-identity-esr-pin-and-patch-regeneration-a/40-07-PLAN.md", ".planning/workstreams/deploy/phases/40-release-identity-esr-pin-and-patch-regeneration-a/40-07-SUMMARY.md", ".planning/workstreams/deploy/phases/40-release-identity-esr-pin-and-patch-regeneration-a/40-08-PLAN.md", ".planning/workstreams/deploy/phases/40-release-identity-esr-pin-and-patch-regeneration-a/40-08-SUMMARY.md", "LICENSING.md", "README.md", "THIRD-PARTY-NOTICES.txt", "configuration.toml", "docs/BUILD.md", "docs/REBRANDING.md", "docs/RELEASING.md", "inventory/brand-tokens.json", "powerbrowser/branding/dev/pref/firefox-branding.js", "powerbrowser/branding/release/pref/firefox-branding.js", "powerbrowser/distribution/policies.json", "powerbrowser/endpoint-allowlist.json", "powerbrowser/packaging/version/release.txt", "powerbrowser/packaging/version/version.txt", "scripts/generate-licensing.mjs", "scripts/generate.mjs", "scripts/lib/config-schema.json", "scripts/lib/endpoint-verdict.mjs", "scripts/rebase-upstream.sh", "scripts/regenerate-patches.sh", "scripts/verify-downstream-fixture.mjs", "scripts/verify-endpoints.sh", "scripts/verify-extension-pins.mjs", "scripts/verify-generated-identity.mjs", "scripts/verify-manifest-literals.mjs", "scripts/verify-mar-update-hop.mjs", "scripts/verify-ng-064-update-url.mjs", "scripts/verify-ng-069-sidecar-egress.mjs", "scripts/verify-platform.sh", "scripts/verify-release-identity.mjs", "scripts/verify-theia-endpoints.mjs", "scripts/verify-trademark-surface.mjs", "scripts/verify-update-channel.mjs", "scripts/verify-update-prefs.mjs", "scripts/verify-upstream-pins.mjs", "scripts/verify-webextensions.mjs"]
covered_digest: "v3:sha256:47acfbca4d10dc5f999db3d8fceafe902e0e5014396dc24a279cc2b427161c17"
behavior_unverified: 0
overrides_applied: 0
re_verification:
  previous_status: human_needed
  previous_score: 70/73
  trigger: "code-review fix wave cb7fe7c..b5ba096 (CR-01, WR-01..WR-05, IN-06, IN-07) changed covered files after the 2026-10-22T05:09:43Z run"
  gaps_closed: []
  gaps_remaining: []
  regressions: []
deferred:
  - truth: "PKG-08: LICENSING.md and THIRD-PARTY-NOTICES.txt ship as assets of every Release"
    addressed_in: "Phase 49"
    evidence: "DIST-07: the draft's asset set must equal the manifest-derived set, which includes LICENSING.md and THIRD-PARTY-NOTICES.txt"
  - truth: "PKG-09: the en-US scope is stated on /download"
    addressed_in: "Phase 47"
    evidence: "Phase 47 SC3 / WEB-02: /download gives ... the en-US scope"
  - truth: "Full-tier mar-update-hop row (live N to N+1 hop) on a packaged build"
    addressed_in: "Phase 46"
    evidence: "Phase 46 depends on Phase 45 for the packaged mar-update-hop run (UPD-24); SC1 is asserted by the full-tier mar-update-hop row"
advisory:
  - finding: "CR-01: on an upstream file that moved since the patch was generated, --check strips context, @@ and index lines, so a hand edit confined to a context line of that file is not detected; editing a patch's index line forces that file onto the normalised path"
    category: other
    reason: "Known limit of the accepted CR-01 comparison rule; +/- line edits stay red on both paths (self-test cases 2 and 8). Resolved by the owner ruling on the comparison rule (human item 3)"
    evidence_status: "none provided"
human_verification:
  - test: "Sign off the seven judgment-tier prohibitions listed under 'Prohibitions' in this report (40-02 write-mode refusal, 40-03 revision not in version_display.txt, 40-04 no Mozilla update host, 40-05 link prefs not unattended, 40-05 downstream does not inherit [urls] links, 40-07 no omitted package, 40-08 executor did not push)"
    expected: "Each prohibition holds. The verifier's non-authoritative verdict for all seven is HOLDS, each backed by a test or built-tree evidence recorded in the table"
    why_human: "unverified-prohibition -- human review recommended. Judgment-tier prohibitions are never passed silently by the verifier (ADR-550 D4)"
  - test: "Accept or reject three backstop truths that have only code-presence evidence: (a) 40-04 host comparison in verify-mar-update-hop.mjs is case- and path-insensitive (it uses new URL().hostname, ng064 uses .host); (b) 40-05 pref emission and the verdict function hold no shared mutable state under concurrent runs; (c) 40-07 an interrupted generate-licensing.mjs write never leaves a partial notice file (temp file + renameSync in scripts/generate-licensing.mjs)"
    expected: "Owner accepts each as held, or asks for a test"
    why_human: "verification: backstop truths need a passing test or directly observed behavior; presence and wiring do not qualify (insufficient_spec)"
  - test: "Rule on the three behaviour changes the fixer marked 'requires human verification': (a) CR-01 -- regenerate-patches.sh --check byte-compares only files whose pre-image blob is unchanged and compares moved files on +/- lines only, which departs from AUTO-10's literal 'byte-compares' and '+++ b/ headers' wording; (b) WR-02 -- release-identity reads only tags HEAD contains, allows an equal ancestor tag, and leaves 'the key is new' to release.yml / TRAIN-01; (c) WR-04 -- a downstream with a different identity whose urls.release_notes or urls.homepage equals the platform's value is refused"
    expected: "Owner accepts each rule, or asks for a change. If (a) is accepted, AUTO-10's wording in REQUIREMENTS.md should be updated to the per-file rule"
    why_human: "Each is a deliberate rule change against requirement or plan wording; the self-tests prove the rule as written, not that it is the rule the owner wants"
  - test: "Optionally re-dispatch rebase-upstream.yml with tag FIREFOX_153_5_1esr_RELEASE at the current workspace/deploy head"
    expected: "Run concludes success"
    why_human: "Run 39725128513 (head 2d4225a) predates the CR-01, WR-01, WR-04 and IN-07 changes to scripts/rebase-upstream.sh, scripts/regenerate-patches.sh and scripts/generate.mjs, which are on that workflow's path. Local evidence says the run would still pass (regenerate --check reports 0 moved files at the pin, generate --check green), but the dispatched run itself covers the older code"
---

# Phase 40: Release identity, ESR pin and patch regeneration (A) Verification Report

**Phase Goal:** The tree is on the current ESR security release, every release identity fact (release key, update channel, version files, update and release-notes URLs, licence notices) derives from `configuration.toml`, a patch can change only through regeneration, and `rebase-upstream.yml` replays the pin green inside Nix as a callable workflow.
**Verified:** 2026-10-22T16:08:03Z
**Status:** human_needed
**Re-verification:** Yes -- after the code-review fix wave (CR-01, WR-01..WR-05, IN-06, IN-07; commits cb7fe7c..b5ba096, report dd0a39c)

All five roadmap success criteria still hold on the current tree. None of the eight fixes reversed a verified truth; four of them tighten a check (WR-01, WR-04, WR-05, IN-07), and three change a rule the owner should ratify (CR-01, WR-02, WR-04). No gap blocks the goal. The status stays `human_needed` because the protocol routes judgment-tier prohibitions, code-presence-only backstop truths and those rule changes to the owner.

## Evidence run by the verifier (this pass)

- `scripts/verify-platform.sh --quick`: exit 0, 380 PASS lines, `verify-platform: PASS -- all checks passed`. The FAIL strings in its log are self-test plant output (`plant N ...: red`), not row failures. `git status --porcelain` was identical before and after the run.
- `patches-regenerated`: `PASS -- 4 patch(es) equal their regeneration from upstream/ (0 on moved upstream files, compared on their added and removed lines)`. At the pin, every file takes the byte-compare path. Two further `--check` runs: byte-identical output. `git diff --exit-code -- patches/` clean.
- `patches-regenerated-self-test`: 10 cases PASS, including the 6 original cases, plus CR-01 (clean `--3way` replay onto a moved upstream is green with a NOTE naming 010-a.patch only; a hand-edited `+` line on the moved upstream is red) and WR-01 (a two-file patch with one file unchanged upstream is refused by write mode with the bytes unchanged and by `--check`, naming two.txt; a deletion is kept through write and `--check`).
- `release-identity`: PASS, key `v153.5.1-1`, 0 descriptors, 0 release tags on this branch (milestone tags v1.0..v1.4 do not match the shape). Self-test: 7 plants red naming the file or tag (including the new "older commit tagged one revision above the key"), 5 controls green (including WR-02's "older commit tagged at the key" and "higher tag on a commit HEAD does not contain").
- `update-prefs`: PASS; two runs byte-identical. Self-test: 10 plants red, including the five UPD-25 prefs and `app.update.background.enabled` (which the removed hand list did not cover); the `extensions.update.autoUpdateDefault` control stays green. `FORBIDDEN_UPDATE_PREFS` has no remaining importer.
- `update-channel` + self-test (10 faults), `endpoint-dispositions-self-test` (powerbrowser.org and github.com red unattended), `verify-upstream-pins` + self-test (8 faults), `generate-self-test` (67 plants, including `revision written with a decimal point -> red`), `licensing` + self-test: all PASS.
- `resolveConfig` on copies of `configuration.toml` with `revision` = `1.0`, `1.5`, `"1"`, `0`: each refused naming `product.revision` (`1.0` with the new "written with a decimal point" message); `1` and `2` resolve.
- WR-04 directly: every tracked downstream fixture manifest resolves except `missing-required-key`, which is a negative fixture and already failed on `identity.display_name` and `urls.update`. The `canonical-name` fixture with its `urls.release_notes`/`urls.homepage` lines removed is refused naming both keys.
- WR-03: `node --check scripts/verify-ng-069-sidecar-egress.mjs` ok; `violations(allowlist.hosts, [open-vsx.org, github.com, powerbrowser.org, evil.example], {userAction:false})` returns `[evil.example, github.com, powerbrowser.org]`. The file hashes `33302452...61cfd` against the locked `8f507194...134c`; this awaits the owner's hash re-lock and is expected, not a gap (see Notes).
- `bash scripts/rebase-upstream.sh --tag FIREFOX_153_5_1esr_RELEASE --dry-run`: exit 0, prints step 4a with the CR-01 wording and the held-failure note. `bash -n` clean.
- Fix-diff scan (`git diff cb7fe7c~1 dd0a39c -- scripts docs`): no TBD, FIXME, XXX, TODO, HACK or placeholder marker added.

## Live evidence carried from the 2026-10-22T05:09:43Z run (not re-run, by instruction)

Real build `DeBIOS powerbrowser 153.5.1esr`; `config.status` channel `default`, MAR ids `powerbrowser-default`; `application.ini [AppUpdate]` on updates.powerbrowser.org; ng064 PASS; licensing byte match against the built about:license; layer 3 exit 0; toolchain-baseline empty diff; owner-observed About dialog pass; `rebase-upstream.yml` run 39725128513 success at `FIREFOX_153_5_1esr_RELEASE` (head 2d4225a). None of the fixes touches the build inputs these were taken from (`.mozconfig`, branding prefs, policies, version files and the patches are unchanged since 2d4225a), so they remain valid for the tree. The dispatched run's coverage of the changed rebase path is human item 4.

## Goal Achievement

### Roadmap success criteria

| # | Success criterion | Status | Evidence |
|---|---|---|---|
| 1 | `configuration.toml` pins `FIREFOX_153_5_1esr_RELEASE` with `--quick` green (DIST-06 first); `rebase-upstream.yml` gains `on: workflow_call`, runs `node scripts/generate.mjs` inside `nix develop .#theia`, `tag` has no default asserted by `verify-upstream-pins.mjs` (AUTO-08); a dispatched run against that tag is green | VERIFIED | Pin and workflow unchanged by the fixes; `verify-upstream-pins` PASS and its 8-fault self-test PASS; `--quick` green at HEAD; run 39725128513 success (carried). The rebase script changed under CR-01 only in how a regenerate failure is reported (held until the brand scan, classifier and overlay checks run, then exit 1); dry-run clean. |
| 2 | Quick rows `release-identity` and `update-channel` green; self-tests red on a planted hand-written version literal, a descriptor version disagreeing with the key, and `powerbrowser-release` in one consumer | VERIFIED | Both rows PASS. Release-identity self-test reds the version.txt and release.txt literals and both descriptor fields; update-channel self-test reds `powerbrowser-release` in docs/RELEASING.md and docs/BUILD.md. WR-02 narrows the tag scan to `git tag --merged HEAD` and allows an equal ancestor tag; it does not touch the version-literal or descriptor halves. |
| 3 | Shipped `policies.json` has no `AppUpdateURL`; About-dialog release-notes and fallback links open the `[urls]` pages without throwing; allowlist accepts `user-initiated`; a planted unattended prefetch to powerbrowser.org goes red naming the host | VERIFIED | `update-channel` PASS line asserts policies.json carries no update URL; `update-prefs` asserts the four link prefs equal `releaseLinkPrefs(config)` and parse; disposition self-test reds powerbrowser.org and github.com unattended. WR-03 extends the same verdict to layer 4's live half. IN-06 corrected BUILD.md's description of the update URL mechanism. |
| 4 | Quick row `patches-regenerated` passes on every tracked patch and goes red naming the patch on a hand-edited hunk body; update-prefs row goes red on a planted `app.update.auto` | VERIFIED | Row PASS on all 4 patches, all byte-compared. Hand-edited `+` line red naming 010-a.patch on the pinned upstream and on a moved upstream. `update-prefs-self-test`: `app.update.auto planted in dev -> red`. The CR-01 rule for moved files is human item 3(a). |
| 5 | `LICENSING.md` and `THIRD-PARTY-NOTICES.txt` generated with a drift row green; README and PROJECT.md state en-US-only scope | VERIFIED | `licensing: PASS ... (716 Theia packages in 337 licence groups, Node.js runtime v24.19.0)`, no SKIP line; self-test PASS. No fix touched these files or README/PROJECT.md. |

### Plan must-have truths (merged, 68) -- effect of the fixes

| Plan | Truths | Verified | Fix impact |
|---|---|---|---|
| 40-01 | 6 | 6 | None. |
| 40-02 | 8 | 8 | CR-01 and WR-01 changed regenerate-patches.sh. Truth 1 (`--check` PASS on 4 patches): re-run PASS. Truth 2 (self-test reds a hand-edited `+` line): PASS on both paths. Truth 3 (rebase-upstream.sh runs `--check` after the surface check): still at that position; a failure is now held to the end and still exits 1. Truth 4 (write mode rewrites nothing): `patches/` clean. Truth 5 (duplicate path refused): self-test PASS; paths now come from both sides of `diff --git` headers, a superset of `+++ b/`. Truth 6 (empty regeneration named): PASS. Truth 7 (byte pinning, cmp equality): every git env/flag pin unchanged (lines 88-89, 190); `cmp` equality is still the rule for every file upstream did not move, which is every file at the pin; moved files use the CR-01 rule (human item 3a). Backstop truth 8 (ordering): two `--check` runs byte-identical. |
| 40-03 | 6 | 6 | IN-07 adds a decimal-point refusal (spot-checked). WR-02 narrows the tag scan; the truth "tags agree with releaseIdentity()" still holds and its self-test covers ancestor-above, ancestor-equal, side-branch and HEAD cases. |
| 40-04 | 14 | 13 | None. Insufficient_spec unchanged: host comparison in `verify-mar-update-hop.mjs` (`.hostname`), no letter-case test. |
| 40-05 | 9 | 8 | WR-03 moves layer 4's live half onto the shared verdict; WR-04 refuses inherited links for a renamed downstream. Insufficient_spec unchanged: no-shared-mutable-state concurrency truth. |
| 40-06 | 8 | 8 | WR-05 replaces the hand-kept list with a derived owned set. Truth 2 (none of the five prefs) holds as a subset of the new rule; truth 5 (`extensions.update.autoUpdateDefault` does not trip) holds because the rule reads only the `app.update.*` / `app.releaseNotesURL*` family, and the self-test control stays green. Two runs identical; tree unchanged. |
| 40-07 | 10 | 9 | None. Insufficient_spec unchanged: temp-file rename on interruption. |
| 40-08 | 7 | 7 | None; live evidence carried. |

**Score:** 70/73 truths verified (0 present-behavior-unverified; 3 insufficient_spec routed to human verification)

### Prohibitions (judgment tier, non-authoritative verifier verdict)

| Plan | Prohibition | Verdict | Evidence |
|---|---|---|---|
| 40-02 | Write mode must not overwrite a tracked patch with empty, partial or non-diff output | HOLDS (flagged) | Self-test: pristine-upstream write refusal with unchanged sha256; WR-01 adds a refusal with unchanged bytes when a regeneration drops a path (`check_kept` runs before any write). |
| 40-03 | Revision must not reach `version_display.txt` or `--with-version-file-path` | HOLDS (flagged) | Built binary reports `153.5.1esr` (carried); no fix touches the version-file path to Gecko. |
| 40-04 | No shipped build's effective update URL names a Mozilla host | HOLDS (flagged) | ng064 PASS on the built tree (carried); policies.json has no update URL (`update-channel` row). |
| 40-05 | About-dialog link prefs are not an unattended callout | HOLDS (flagged) | `releaseLinkPrefs` separate from `mozillaEndpointPrefs`; disposition self-test reds both user-initiated hosts unattended; layer 4 now applies the same verdict (WR-03). |
| 40-05 | A downstream must not silently ship Power Browser's release-notes or homepage links | HOLDS (flagged), stronger than planned | The plan's mechanism was the D-08 echo. WR-04 now refuses a renamed downstream that inherits either link, naming the key; verified directly on a stripped fixture and by `generate-self-test`. |
| 40-07 | Notices must not omit any shipped Theia or Node package | HOLDS (flagged) | `licensing-self-test` PASS (unresolvable dependency, added and removed package red). |
| 40-08 | No executor task pushes or dispatches | HOLDS (flagged) | Unchanged from the previous pass; the run event is the owner's `workflow_dispatch`. |

### Deferred Items

| # | Item | Addressed In | Evidence |
|---|---|---|---|
| 1 | Notices ship as assets of every Release (PKG-08 last clause) | Phase 49 | DIST-07 asset set includes LICENSING.md and THIRD-PARTY-NOTICES.txt |
| 2 | en-US scope on /download (PKG-09) | Phase 47 | Phase 47 SC3 / WEB-02 |
| 3 | Full-tier `mar-update-hop` drill | Phase 46 | Phase 46 depends on Phase 45 for the packaged mar-update-hop run; SC1 asserts it |

### Advisory (New Scope, Unevidenced)

| # | Finding | Category | Why Advisory |
|---|---|---|---|
| 1 | Under CR-01, a hand edit confined to a context line of a moved upstream file is not detected, and an edited `index` line routes a file to the normalised comparison | other | Known limit of the rule under owner review (human item 3a); no failing case on the current tree, where no file is moved |

### Required Artifacts

| Artifact | Status | Details |
|---|---|---|
| `configuration.toml` | VERIFIED | pin, `revision = 1`, `[urls]` update/release_notes/homepage |
| `.github/workflows/rebase-upstream.yml` | VERIFIED | unchanged since the dispatched run |
| `scripts/verify-upstream-pins.mjs` | VERIFIED | row + 8-fault self-test |
| `scripts/regenerate-patches.sh` | VERIFIED | write, `--check`, `--self-test` (10 cases); wired into rebase-upstream.sh and the registry |
| `scripts/lib/config-schema.json` | VERIFIED | `product.revision` integer, required, minimum 1; decimal-point refusal in `generate.mjs` (IN-07) |
| `powerbrowser/packaging/version/{version,release}.txt` | VERIFIED | `153.5.1`, `v153.5.1-1` |
| `scripts/verify-release-identity.mjs` | VERIFIED | row + self-test (7 plants, 5 controls) |
| `scripts/verify-update-channel.mjs` | VERIFIED | row + self-test |
| `.mozconfig` | VERIFIED | channel `default`, MAR ids `powerbrowser-default` |
| `powerbrowser/distribution/policies.json` | VERIFIED | no update URL policy |
| `scripts/lib/endpoint-verdict.mjs` | VERIFIED | used by layer 3, allowlist-schema and now layer 4 live |
| `powerbrowser/endpoint-allowlist.json` | VERIFIED | powerbrowser.org and github.com `user-initiated` |
| `powerbrowser/branding/{dev,release}/pref/firefox-branding.js` | VERIFIED | link prefs and langpack false |
| `scripts/verify-update-prefs.mjs` | VERIFIED | derived owned set (WR-05), row + 10-plant self-test |
| `scripts/generate-licensing.mjs`, `LICENSING.md`, `THIRD-PARTY-NOTICES.txt` | VERIFIED | generator, drift row, self-test |

### Key Link Verification

| From | To | Status |
|---|---|---|
| rebase-upstream.yml | scripts/rebase-upstream.sh | WIRED |
| scripts/rebase-upstream.sh | scripts/regenerate-patches.sh | WIRED (`--check` after check-patch-surface; failure held, then exit 1) |
| verify-platform.sh | regenerate-patches / release-identity / update-channel / update-prefs / licensing | WIRED (rows ran in `--quick`) |
| verify-endpoints.sh layer 3 | scripts/lib/endpoint-verdict.mjs | WIRED |
| verify-ng-069-sidecar-egress.mjs (layer 4 live) | scripts/lib/endpoint-verdict.mjs | WIRED (`import { violations }`, called with `userAction: false`) -- new under WR-03 |
| verify-update-prefs.mjs | generate.mjs `releaseLinkPrefs` | WIRED (owned set derived from it) |
| generate.mjs | .mozconfig / branding prefs / version files | WIRED (generated-byte-identity PASS) |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|---|---|---|---|
| Commit gate | `scripts/verify-platform.sh --quick` | exit 0 | PASS |
| Patch gate determinism | `regenerate-patches.sh --check` x2 | byte-identical, 0 moved | PASS |
| Revision parsing | `resolveConfig` with `1.0`, `1.5`, `"1"`, `0`, `1`, `2` | first four refused naming `product.revision`; last two resolve | PASS |
| Downstream link refusal | `resolveConfig` on canonical-name fixture without its link lines | refused naming `urls.release_notes` and `urls.homepage` | PASS |
| Downstream fixtures | `resolveConfig` on every tracked downstream manifest | all resolve except the negative `missing-required-key` | PASS |
| Layer 4 verdict | `violations()` over the real allowlist | user-initiated and unlisted hosts returned | PASS |
| Rebase path | `rebase-upstream.sh --tag FIREFOX_153_5_1esr_RELEASE --dry-run` | exit 0 | PASS |

### Probe Execution

Not applicable: no `scripts/*/tests/probe-*.sh` is declared by the phase; verification runs through `verify-platform.sh` rows.

### Requirements Coverage

| Requirement | Plan | Status | Evidence |
|---|---|---|---|
| DIST-06 | 40-01, 40-08 | SATISFIED | pin, own commit, dispatched run green |
| AUTO-08 | 40-01, 40-08 | SATISFIED | workflow_call, no default, Nix wrap, verify-upstream-pins asserts |
| REL-01 | 40-03 | SATISFIED | row + self-test; the "strictly greater than the latest Release" check is assigned to DIST-02 / TRAIN-01 by REL-01's own text, consistent with WR-02 |
| UPD-11 | 40-04, 40-08 | SATISFIED | row + self-test |
| UPD-12 | 40-04, 40-08 | SATISFIED | policy removed; BUILD.md corrected (IN-06) |
| UPD-13 | 40-05, 40-08 | SATISFIED | prefs from `[urls]`, owner-observed About dialog |
| UPD-33 | 40-05 | SATISFIED | third disposition, shared verdict in layers 3 and 4, self-test |
| UPD-25 | 40-06 | SATISFIED | langpack false; row now refuses any un-owned `app.update.*` pref, a superset of the five |
| PKG-08 | 40-07 | SATISFIED (release-asset clause deferred to Phase 49) | generator + drift row |
| PKG-09 | 40-07 | SATISFIED for Phase 40 scope | README and PROJECT.md; /download deferred to Phase 47 |
| AUTO-10 | 40-02 | SATISFIED, wording deviation pending owner ruling | Row passes all patches byte-compared at the pin and reds a hand-edited hunk; the moved-file rule departs from the literal "byte-compares" (human item 3a) |

No orphaned requirement.

### Anti-Patterns Found

None in the fix diff. No debt markers added.

### Notes (non-blocking)

- WR-03: `scripts/verify-ng-069-sidecar-egress.mjs` hashes `333024522b0bb2b0943f4ed2cc95d56ecd516a385e71affcdf81c1bd8ba61cfd`, not the locked `8f507194...134c`. This is the expected owner re-lock. At the time of this run the working tree carried an uncommitted check-lock entry recording the new hash for commit 71d3807; the verifier did not create, stage or commit it. The ng069 row is full tier and was not run.
- Carried from the previous pass: PKG-09's "in the release notes" clause has no owning requirement (add it to DIST-07 or a Phase 50 criterion); `release-identity` on the real tree reads 0 descriptors and 0 release tags, so those halves are proved by the self-test only until Phase 49.
- REVIEW-FIX lists IN-01..IN-05 as out of scope by owner ruling; none affects a Phase 40 truth.

### Human Verification Required

### 1. Judgment-tier prohibitions

**Test:** Review the seven rows in the Prohibitions table.
**Expected:** Each holds; the verifier's non-authoritative verdict is HOLDS for all seven.
**Why human:** unverified-prohibition, human review recommended.

### 2. Backstop truths with code-only evidence

**Test:** Accept or reject (a) mar-update-hop host comparison by `new URL().hostname`, (b) 40-05 no shared mutable state under concurrent runs, (c) 40-07 interrupt-safe write by temp file and rename.
**Expected:** Accept, or request a test for any of them.
**Why human:** backstop truths need a passing test or observed behavior.

### 3. Rule changes from the fix wave

**Test:** Rule on (a) CR-01's per-file comparison (byte compare for unmoved files, +/- lines for moved files) against AUTO-10's literal wording; (b) WR-02's tag rule (ancestor tags only, equal allowed, "key is new" left to release.yml / TRAIN-01); (c) WR-04's refusal of a renamed downstream that inherits `urls.release_notes` or `urls.homepage`.
**Expected:** Accept each, or ask for a change; on (a), update AUTO-10's wording.
**Why human:** each is a deliberate rule change; the self-tests prove the rule as written, not that it is the intended rule.

### 4. Re-dispatch of the rebase workflow (optional)

**Test:** Dispatch `rebase-upstream.yml` with `FIREFOX_153_5_1esr_RELEASE` at the current head.
**Expected:** success.
**Why human:** run 39725128513 predates the changes to the scripts on that workflow's path.

### Gaps Summary

No gaps. The fix wave changed the patch gate, regenerate write mode, the release-identity tag rule, the update-prefs rule, the downstream link refusal and revision parsing. Each change was re-checked against the tree: every phase row and self-test passes in `--quick`, the spot-checks behave as the fixes state, and no previously verified truth was reversed. The remaining items are owner decisions required by the verification protocol, not missing work.

---

_Verified: 2026-10-22T16:08:03Z_
_Verifier: Claude (gsd-verifier)_
