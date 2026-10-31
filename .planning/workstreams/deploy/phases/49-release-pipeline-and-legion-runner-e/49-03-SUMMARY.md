---
phase: 49-release-pipeline-and-legion-runner-e
plan: 03
subsystem: release-pipeline
status: complete
tags: [release, sign-publish, mar, signmar, asset-set, bot-app, sec-07, dist-07]
requires:
  - 49-01 (release.yml skeleton, the build-linux gates, the release-shape row)
provides:
  - .github/workflows/release.yml sign-publish detail: stale-approval guard, MAR channel gate, signmar -s, signmar -v against the tracked DER, SHA256SUMS, source tarball and notices, attestation, draft, asset-set equality, bot-App token, single publish
  - scripts/verify-mar-channel-gate.mjs: the mar-channel-gate row
  - scripts/verify-release-asset-set.mjs: the release-asset-set row, plus the expected-name and live-compare modes the release job calls
affects:
  - 49-04 (descriptor and channel-live placeholders remain), 49-05 (R2 copy of each signed MAR is placed before the publish)
key-files:
  created:
    - scripts/verify-mar-channel-gate.mjs
    - scripts/verify-release-asset-set.mjs
  modified:
    - .github/workflows/release.yml
    - scripts/verify-platform.sh
decisions:
  - "The draft is created with the workflow token (contents write), which cannot create a git tag for a draft. The bot App token is minted immediately before the publish, and that publish is what creates the tag v<ESR>-<revision>."
  - "The channel gate reads the MAR product-info channel with signmar -T, and compares it with ACCEPTED_MAR_CHANNEL_IDS from powerbrowser/packaging/mozconfig.release. It also cross-checks the manifest update channel (the --channel value) against --enable-update-channel from the same emission, naming both on a mismatch. An empty or unparsed product-info channel fails closed."
  - "The signing tools travel as a second artifact (signing-tools: objdir-release/dist/bin/signmar and the NSS libraries), because sign-publish runs on ubuntu-latest with no objdir. The container-built signmar is the signing tool; Nix is not used in the sign job."
  - "The expected asset names follow the generation rule in docs/RELEASING.md (<app_basename>-<version>.<target-token>.<ext> and <app_basename>-<target-token>.<ext>), with version equal to the tag minus its leading v, and the target token taken from the Linux row of that table. The source tarball is <app_basename>-<version>.source.tar.gz. The source-tarball name is a new naming choice that the docs table does not yet record."
  - "The asset-set equality is split. The row proves, statically, that the expected set is derived from the tree and that the equality step sits between attestation and the single publish. The live draft list is compared by the release job through the same script in --manifest --draft mode, because only a live draft can be compared against."
  - "The bot App input is client-id (create-github-app-token v3.3.0 deprecates app-id). The variable is BOT_APP_CLIENT_ID."
metrics:
  tasks: 2
  commits: 1
  duration: "single session"
actuals:
  tokens: 11452
  tasks: 2
  commits: 1
plan_head_before: 777e0b0e039c2e450e67601efe1f1b4bd59b09df
plan_head_after: d9458e12a2b935adf14ae022f3d659f13a4bd88f
---

# Phase 49 Plan 03: sign-publish detail, MAR channel gate and asset-set equality Summary

`sign-publish` now carries the signing, verification and publish order for the release, and two quick rows prove the order and the derivations. Nothing was signed, verified or published: the live steps run only at release time, behind the `release` environment approval.

## Commit

- `d9458e1` feat(49-03): sign-publish channel gate, sign-verify order, draft set equality and the single bot publish (Tasks 1 and 2)

Tasks 1 and 2 share one commit. Both edit `release.yml` and the registry file, and each row needs the other's step ids to exist.

Base for the measurement is `777e0b0`, the external commit that gates the checked-out SHA and builds uncached. That commit landed before this plan's first commit, and this summary keeps it as part of the base.

## sign-publish step order

1. Download `release-linux` and `signing-tools`; check out the release commit (`persist-credentials: false`).
2. Install `libnss3-tools`; mark `signmar` executable.
3. `newer_guard`: exit 1 when the latest published Release is not strictly older than the manifest key (stale approval).
4. `mar_channel_gate`: the update channel in the manifest must equal `--enable-update-channel` in the emission (both named on a mismatch); `signmar -T` reads the MAR product-info channel; it must equal `ACCEPTED_MAR_CHANNEL_IDS` from `powerbrowser/packaging/mozconfig.release`, else exit 1 (MAR_CHANNEL_MISMATCH_ERROR).
5. `sign_mar`: imports the release key from the environment secrets into a scratch NSS database and runs `signmar -s` to `release/signed/`.
6. `verify_mar`: imports `powerbrowser/packaging/mar/mar-primary.der` (the tracked certificate) and runs `signmar -v` against the signed MAR, before any upload.
7. Scratch databases removed (`if: always()`).
8. Asset assembly from the manifest-derived names; `SHA256SUMS` over the assets; the source tarball by `git archive` at the release commit; the two notices copied from the tree.
9. `actions/attest-build-provenance` over `assets/*`.
10. `draft_release`: one `gh release create --draft --target <sha>` call carrying every asset; notes derived from the key, the commit and the Gecko ESR tag (no `--generate-notes`).
11. `asset_set`: the draft's asset names against the manifest-derived set, as set equality (`scripts/verify-release-asset-set.mjs --manifest --draft`).
12. `bot`: `actions/create-github-app-token` v3.3.0, minted immediately before the publish.
13. `publish` (`id: publish`): `gh release edit --draft=false`, the single publish, with the bot token. This creates the tag `v<ESR>-<revision>`.

The DIST-08 R2 copy sits before step 13, and its step text is owned by plan 49-05.

## Self-test outputs

`node scripts/verify-mar-channel-gate.mjs --self-test` (exit 0):

```
  ok  baseline -> green
  ok  foreign-channel MAR accepted (mismatch refusal removed) -> red, naming .github/workflows/release.yml and 'ACCEPTED_MAR_CHANNEL_IDS'
  ok  gate compares the MAR channel with --channel -> red, naming .github/workflows/release.yml and '--channel'
  ok  signmar -v against a non-tracked DER -> red, naming .github/workflows/release.yml and 'mar-primary.der'
  ok  sign-before-verify swap -> red, naming .github/workflows/release.yml and 'verify_mar runs before sign_mar'
mar-channel-gate: --self-test PASS -- the unmodified sign-publish is green and 4 planted faults each went red naming the file and the fault. It writes nothing.
```

`node scripts/verify-release-asset-set.mjs --self-test` (exit 0):

```
  ok  baseline -> green
  ok  dropped asset (LICENSING.md) -> red, naming 'LICENSING.md'
  ok  extra asset (stray.zip) -> red, naming 'stray.zip'
  ok  stable-name drift -> red, naming 'powerbrowser-linux-x86_64.tar.xz'
  ok  versioned-name drift -> red, naming 'powerbrowser-153.5.1-1.linux-x86_64.tar.xz'
  ok  publish before the asset-set equality -> red, naming 'publish runs before the asset-set equality'
release-asset-set: --self-test PASS -- the unmodified draft and publish order are green and 5 planted faults each went red naming the asset or the step. It writes nothing.
```

Live rows: `mar-channel-gate: PASS -- sign-publish refuses a MAR whose product-info channel is not ACCEPTED_MAR_CHANNEL_IDS 'powerbrowser-default' (update channel 'default') before signmar -s; signmar -v verifies against powerbrowser/packaging/mar/mar-primary.der before any upload.` and `release-asset-set: PASS -- sign-publish creates a draft with every asset, checks it against 8 derived names ...`. The expected-name mode prints the eight names for release key v153.5.1-1 (for example `powerbrowser-153.5.1-1.linux-x86_64.tar.xz` and `powerbrowser-linux-x86_64.tar.xz`).

Registry: `scripts/verify-platform.sh --quick` returned `verify-platform: PASS -- all checks passed` with the four new rows. The `update-channel` quick row first flagged this plan's prose, which named `--channel` followed by a word. The prose was reworded with the flag in backticks, and that row is green. zizmor: `No findings to report`. `workflows` and `release-shape` remain green on the sign-publish text.

## Verification of the plan's literal criteria

- `grep -q 'mar-primary.der'` and `grep -q 'signmar -v'` in release.yml: both present.
- `--draft=false` and `--draft` present; `generate-notes` absent; `pull_request` and `schedule` absent.
- Registry: `mar-channel-gate` and `release-asset-set` each appear once as a row, with their self-test rows.

## Deviations from Plan

**1. [Rule 3 - Blocking] Signing tools uploaded from build-linux.** sign-publish runs on ubuntu-latest and has no objdir, so `signmar` has to come from an artifact. Added a `signing-tools` upload (`objdir-release/dist/bin/signmar` and the NSS libraries, retention 1) to build-linux and a download in sign-publish. The plan's text did not name this artifact. The first sign-publish run is the proof that this `signmar` runs on ubuntu-latest (RESEARCH Open Question 5).

**2. [Rule 1 - Bug, found by the row] Step id missing.** The publish step had no `id: publish`, so the order check could not find it. Added the id.

**3. [Rule 1 - Bug, found by the row] Swap helper cut the job below.** The self-test's block swap split on `- name:` and moved the `descriptor` job's text with the publish block. Both swap helpers now swap by line range, bounded by the next step or the next job-level key.

**4. [Deprecation] App token input.** `create-github-app-token` v3 deprecates `app-id`. The workflow uses `client-id` and the variable `BOT_APP_CLIENT_ID`.

**5. [Plan snippet fault avoided] Live set equality.** The plan asks the row to compare the draft's set with the workflow text. The row cannot see a live draft, so the static half proves derivation and step order, and the release job runs `--manifest --draft` against the live draft. Both halves are in `scripts/verify-release-asset-set.mjs`.

**6. [Concurrent edit] release.yml changed under this run.** Commit `777e0b0` (outside this executor run) gated the checked-out SHA, required a full 40-hex SHA, and built the image uncached. It was kept as the base. Every row stayed green on it.

## Known Stubs

None in sign-publish. The R2 copy of each signed MAR is not yet written; the comment before `publish` marks where plan 49-05 places it. Post-publish deletion of the artifacts (the cap mitigation) is not wired.

Descriptor and channel-live remain fail-closed placeholders, to be replaced by plan 49-04.

## Flagged Assumptions (SEC-07 and DIST-07)

- **SEC-07 (unclassified edge):** the row catches the `--channel`/`MAR id` conflation in the gate's comparison and the foreign-channel acceptance. It does not cover a conflation shape elsewhere, such as the descriptor job taking the MAR id as `--channel`; that job is plan 49-04's to prove. No conflation shape escaped this row's plants.
- **SEC-07 live half:** `signmar -T` prints the product-info channel, and the workflow parses it with `sed` for a line containing `channel:`. The exact label is not measured. The gate fails closed: an unparsed value is empty and does not equal the accepted id, so an unexpected format refuses every release instead of accepting one. The first sign-publish run records the real label.
- **SEC-07 live half, signmar on ubuntu-latest:** unmeasured (RESEARCH Open Question 5). The row asserts the tracked DER as the independent comparand either way.
- **DIST-07 expected names:** the source-tarball name `<app>-<version>.source.tar.gz` and the stable and versioned forms for the tarball and the MAR follow the docs rule. The on-disk tarball carries a locale token (`en-US`), which the release renames away from. Owner action: fill the `docs/RELEASING.md` table and confirm the names.
- **DIST-07 concurrency:** the rows read only, proven by design, not by a repeated-run plant.

## Owner Actions Implied by This Plan

- Repository variable `BOT_APP_CLIENT_ID`, and secret `BOT_APP_PRIVATE_KEY` for the bot App (no Workflows permission), in the `release` environment.
- Secrets `MAR_SIGNING_P12_B64` and `MAR_SIGNING_P12_PASSWORD` in the `release` environment. The row never reads them; they are read only by the sign step at release time.
- Approve the `release` environment for each release. Nothing in this plan approves, dispatches or publishes.

## Broken-Windows Register

Not appended in this run. The `.planning/WINDOWS.md` rendered table disagrees with its fenced JSON for rows 10, 11 and 19 (pre-existing, recorded in 49-01's SUMMARY). The append tool refuses to write until the owner regenerates that file. The stub and unrun entries from this plan are listed under Known Stubs and Flagged Assumptions above.

## Self-Check

- Created files present: `scripts/verify-mar-channel-gate.mjs`, `scripts/verify-release-asset-set.mjs`.
- Commit present on the branch: `d9458e1`.
- No `ledger/` file, no `scripts/verify-ng-NNN-*.mjs` file, and no signing material was read, edited or created.
- The word "pull_request" and the word "schedule" do not occur in `release.yml`.

## Self-Check: PASSED
