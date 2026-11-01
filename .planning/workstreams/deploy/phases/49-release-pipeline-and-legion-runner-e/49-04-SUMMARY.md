---
phase: 49-release-pipeline-and-legion-runner-e
plan: 04
subsystem: release-pipeline
status: complete
tags: [release, descriptor, channel-live, dist-08, dist-09, upd-17, mar-origin]
requires:
  - 49-01 (release.yml skeleton, release-manifest.json with mar_origin)
  - 49-03 (sign-publish, the published Release with the signed versioned MAR)
  - Phase 44 (scripts/build-update-xml.mjs, scripts/verify-descriptor-monotonic.mjs)
provides:
  - .github/workflows/release.yml descriptor job (emit, re-emit check, descriptor-monotonic, manifest-vs-tree agreement, MAR-origin form gate, scoped App token, Contents API commit)
  - .github/workflows/release.yml channel-live job (contents read, --manifest, runs last)
  - scripts/verify-channel-live.mjs (ghGet, runChecks, patchUrlForm, formOnly, treeAuthority; --form-only; --self-test)
  - registry rows channel-live-self-test (quick) and channel-live (full tier)
  - scripts/verify-update-download-host.mjs on the 2026-10-29 rule (commit c953d2f5)
affects:
  - powerbrowser/packaging/package-linux.sh (manifest gains build_id, build_target, update_url)
  - scripts/verify-mar-update-hop.mjs (marDigest exported)
tech-stack:
  added: []
  patterns: [tree-decides-manifest-is-a-claim, injected-transport loopback self-test, shared string-level URL form check]
key-files:
  created:
    - scripts/verify-channel-live.mjs
  modified:
    - .github/workflows/release.yml
    - scripts/verify-platform.sh
    - scripts/verify-update-download-host.mjs
    - powerbrowser/packaging/package-linux.sh
    - scripts/verify-mar-update-hop.mjs
    - .planning/workstreams/deploy/phases/49-release-pipeline-and-legion-runner-e/BLOCKED.md
decisions:
  - "The configuration tree decides mar_origin, update_channel and update_url. The manifest is untrusted build output, and a manifest value that differs is red naming both values (two security-review rounds, coordinator)."
  - "Each BUILD_TARGET token must match [A-Za-z0-9_-]+, and every path segment is URI-encoded before it reaches the Contents API or a public URL."
  - "The descriptor job hashes the signed versioned MAR from the published Release, never the unsigned legion MAR."
  - "Descriptor order: emit, then descriptor-monotonic over the emitted tree (it takes --descriptors), then the form gate, then the token mint and the commit."
  - "An unchanged descriptor is a no-op through the Contents API, so a rerun over the same inputs commits nothing."
metrics:
  duration: about 95 minutes
  completed: 2026-10-31
actuals:
  tokens: 18000
  tasks: 3
  commits: 4
plan_head_before: aa11e1ee
plan_head_after: b0c5bd6348cf9516db8b93f8d22d56d6b68c3879
---

# Phase 49 Plan 04: Descriptor commit and channel liveness Summary

The `descriptor` job emits one update.xml per BUILD_TARGET against the signed MAR the Release published. It proves the emission is byte-identical on a re-emit, runs `descriptor-monotonic` and two gates (the manifest must agree with the tree, and every patch URL must be the MAR origin at `/<tag>/<asset>`), and only then commits through a bot App token scoped to `powerbrowser-updates`. The new `channel-live` row derives each value from the manifest and the tree and proves the public channel equals the latest Release. Its self-test runs on mkdtemp and loopback: a green baseline, then 12 plants go red.

## Commits

| Task | Commit | Subject |
| ---- | ------ | ------- |
| 3 | c953d2f5 | feat(49-04): update-download-host reds release-assets URLs and exempts verifier scripts |
| 1 | 1f675e39 | feat(49-04): descriptor job emits, gates and commits one update.xml per BUILD_TARGET |
| 2 | c57f1fb0 | feat(49-04): channel-live row, MAR-origin form gate and ten-plant self-test |
| 2 (review) | b0c5bd63 | fix(49-04): channel-live derives update_url from the tree and allowlists BUILD_TARGET tokens |

A concurrent session committed Task 3 (c953d2f5) on this branch after this run started (HEAD was aa11e1ee) and before Task 1. I drafted my own version of the guard, then dropped it and kept the committed one. The committed guard meets every Task 3 criterion: 8 ok lines, release-assets is red, verifier scripts are exempt by pattern, and the header and registry comment state the 2026-10-29 rule. The plan ledger file was written after that commit landed, so `plan_head_before` above is aa11e1ee, the HEAD at spawn. `git rev-list --count aa11e1ee..b0c5bd63` = 4.

## Verification

- `scripts/verify-platform.sh --quick` over c57f1fb0 (Task 3 and the first hardening included): `verify-platform: PASS -- all checks passed`. Over the b0c5bd63 tree, every row passed except `fixer-isolate-self-test`. It failed with "could not make /run/user/1000/cc-socks/....sock read-only", the known socket-mount race, and `--only fixer-isolate-self-test` passed on the rerun (`verify-platform: PASS -- all checks passed`). The first run, at Task 1, was red in `release-shape-self-test` only. Its plants edit the last job-level `RELEASE_SHA: ${{ inputs.sha }}`, and that line was now in descriptor. I removed the job-level env from descriptor, since sign-publish validates the SHA in the same run, and the row went green.
- `release-shape`, `workflows`, `release-asset-set`, `build-windows-shape` and `zizmor`, plus their self-tests, are green on the final release.yml.
- Plan acceptance greps: `environment: descriptor` count 1; `repositories: powerbrowser-updates`, `--emit`, `--form-only` and `--manifest` are present; no `FIREFOX_[0-9]`; no `Linux_x86_64-gcc3`, `objdir` or MAR-origin host literal in the script. The plan's `grep -c 'channel-live|node $REPO_ROOT/...'` prints 0 for every row, `repo-controls` included, because of a grep quirk with `$` mid-pattern. `grep -Fc` prints 1 for each of the two new rows.

### channel-live --self-test output (13 ok lines: baseline plus twelve plants)

```
  ok  baseline -> green (1 target, descriptor through the baked path, HEAD and GET of https://downloads.powerbrowser.org/v153.5.1-1/powerbrowser-153.5.1-1.linux-x86_64.complete.mar through the loopback)
  ok  wrong hashValue -> red naming SelfTest_fixture-abi and 5ae901dbce0655c9a4241e9b0ddebdd52512fc7c29319e6b8b75e1a1e8b187981b5b47ab9ed8a0656d8758a89192c742c9805c0be79153ade74cfe205d4bd608
  ok  missing target file -> red naming SelfTest_fixture-abi and answered 404, so the descriptor is missing
  ok  404 MAR -> red naming SelfTest_fixture-abi and HEAD https://downloads.powerbrowser.org/v153.5.1-1/powerbrowser-153.5.1-1.linux-x86_64.complete.mar answered 404
  ok  size mismatch -> red naming SelfTest_fixture-abi and "34"
  ok  github.com Releases download patch URL -> red naming SelfTest_fixture-abi and https://github.com/Deocracy/powerbrowser/releases/download/v153.5.1-1/powerbrowser-153.5.1-1.linux-x86_64.complete.mar, before any MAR fetch, live and --form-only
  ok  release-assets patch URL -> red naming SelfTest_fixture-abi and https://release-assets.githubusercontent.com/github-production-release-asset/1/powerbrowser-153.5.1-1.linux-x86_64.complete.mar, before any MAR fetch, live and --form-only
  ok  patch URL on another host -> red naming SelfTest_fixture-abi and https://mirror.example.invalid/v153.5.1-1/powerbrowser-153.5.1-1.linux-x86_64.complete.mar, before any MAR fetch, live and --form-only
  ok  patch path that is not /<tag>/<asset> -> red naming SelfTest_fixture-abi and https://downloads.powerbrowser.org/latest/powerbrowser-153.5.1-1.linux-x86_64.complete.mar, before any MAR fetch, live and --form-only
  ok  non-https patch URL -> red naming SelfTest_fixture-abi and http://downloads.powerbrowser.org/v153.5.1-1/powerbrowser-153.5.1-1.linux-x86_64.complete.mar, before any MAR fetch, live and --form-only
  ok  manifest mar_origin disagreeing with the tree -> red naming https://mirror.example.invalid and https://downloads.powerbrowser.org, live and --form-only
  ok  manifest update_url disagreeing with the tree -> red naming https://mirror.example.invalid/update/6/%PRODUCT%/%VERSION%/%BUILD_ID%/%BUILD_TARGET%/%LOCALE%/%CHANNEL%/%OS_VERSION%/%SYSTEM_CAPABILITIES%/%DISTRIBUTION%/%DISTRIBUTION_VERSION%/update.xml and https://updates.powerbrowser.org/update/6/%PRODUCT%/%VERSION%/%BUILD_ID%/%BUILD_TARGET%/%LOCALE%/%CHANNEL%/%OS_VERSION%/%SYSTEM_CAPABILITIES%/%DISTRIBUTION%/%DISTRIBUTION_VERSION%/update.xml, before any request
  ok  manifest build_target carrying ../ and a path separator -> red naming ../../contents/evil, before any request
channel-live: --self-test PASS -- the clean fixture is green and 12 planted faults each went red naming the target and the value
```

The plan expected 10 ok lines. The three extra lines come from the coordinator's two security-review rounds: a disagreeing mar_origin, a disagreeing update_url, and a BUILD_TARGET carrying `../` and a path separator. The five string-level plants also prove that no MAR request reached the loopback server.

### update-download-host --self-test: 8 ok lines (baseline, four plants, three controls). `node scripts/verify-update-download-host.mjs` passes over 1504 tracked files.

### Live channel-live before the first release (red by design, never green)

```
channel-live: FAIL -- 1 problem(s); the public channel is not proven equal to the latest Release
  - GET repos/Deocracy/powerbrowser/releases/latest found no published Release, so the channel has nothing to equal. Next step: this row stays red until the first public release; publish one through release.yml
```

## Flagged-assumption outcomes (DIST-09 / UPD-17)

- **DIST-09/UPD-17 live halves.** The descriptor commit and a green liveness run happen at release time, and neither was run here. Before the first release, `channel-live` is red and names the missing Release (output above). With `--manifest`, a missing descriptor or MAR also fails closed, naming the endpoint.
- **UPD-17 idempotency.** Holds by read-only design. The row and its self-test write nothing in the repo, and the gh reads are GETs. No repeated live-run plant was added.
- **DIST-09 idempotency.** `build-update-xml.mjs --check --outdir` re-emits and requires byte-identical bytes before the gates. The commit step skips any descriptor whose updates-repo content already matches byte for byte.
- **Phase 44 emitter (formerly assumed absent).** Resolved: `scripts/build-update-xml.mjs` is in the tree. It writes `patchURL` as `<mar_origin>/<tag>/<app_basename>-<tag minus v>.<target token>.complete.mar`, with `mar_origin` from `marOrigin()` and `platformVersion` from application.ini `[Gecko] MaxVersion`. That is the form the gate requires, and `channel-live` derives the asset name with the same formula. The descriptor XML carries one `URL` per patch, and servedMarUrl is the same emitted value, so the gate covers both.

## Deviations from Plan

### Auto-fixed issues

1. **[Rule 3 - Blocking] Descriptor emitter inputs.** The emitter needs `config.status` and `application.ini`, and neither was in any artifact. `build-linux` now uploads a separate artifact, `release-linux-identity` (retention 1, data), so the `release-linux` layout sign-publish reads does not change. The emitter gets `--config-status`, `--application-ini` and `--mar <signed MAR from the Release>`. (1f675e39)
2. **[Rule 3 - Blocking] Monotonic order.** `descriptor-monotonic` takes `--descriptors <emitted dir>`, so it runs after the emit, not before it as the plan text says. It still runs before any commit. (1f675e39)
3. **[Rule 1 - Bug] release-shape self-test anchor.** The job-level `RELEASE_SHA` was removed from descriptor (see Verification). (1f675e39)
4. **[Rule 3 - Blocking] Manifest fields.** The plan says the manifest carries the BUILD_TARGET set and the baked URL, but `package-linux.sh` wrote neither. `descriptor-monotonic` already requires `build_id` and `build_target`. `package-linux.sh` now writes `build_id`, `build_target` (OS_TARGET_TARGET_XPCOM_ABI from the config.status substs) and `update_url` (the [AppUpdate] URL), and fails if any is empty. I tested the extraction against the dev objdir: `20261020215955|Linux_x86_64-gcc3|https://updates.powerbrowser.org/update/6/...`. (c57f1fb0)
5. **[Rule 2 - Security, coordinator review] The tree decides mar_origin and update_channel.** `treeAuthority()` compares the manifest's values with `marOrigin()` and `updateChannel()`, and fails closed naming both values, in both `--form-only` and the live row. release.yml has an agreement step before the form gate and before the liveness row, the same pattern as `derive_key`. (c57f1fb0)
5a. **[Rule 2 - Security, second review] update_url and BUILD_TARGET.** `update_url` must equal `https://<[urls] update host>` plus `UPDATE_PATH`, else the row is red naming both. `UPDATE_PATH` is the Gecko `[AppUpdate]` path, copied because the hosted job does not fetch upstream/; it is marked as a shortcut, and the self-test fails if it differs from `upstream/build/application.ini.in` wherever that checkout exists. Each BUILD_TARGET token must match `[A-Za-z0-9_-]+`, and every segment is passed through `encodeURIComponent`. The tree cannot supply the BUILD_TARGET set: only the emitter's private table and config.status carry it, and config.status reaches only the descriptor job. The manifest's set therefore stays a validated claim, and the emitter refuses any target outside its table. The release.yml agreement step does not compare update_url; the row does, and the descriptor job never reads update_url. (b0c5bd63)
6. **marDigest exported.** The plan's key link imports `marDigest`, which was module-private. One keyword was added to `scripts/verify-mar-update-hop.mjs`, and its self-test is green. (c57f1fb0)
7. **Asset names come from the tree.** `verify-release-asset-set.mjs` runs its CLI when imported, so `channel-live` derives the MAR asset name with `targetTokenOf` (scripts/lib/channel-identity.mjs), the formula the emitter uses. The manifest carries no asset list.
8. The channel-live job text landed in the Task 1 commit together with the descriptor job.

## Known gaps (recorded in BLOCKED.md, section "49-04")

- ~~Both artifacts keep `retention-days: 1`~~ Resolved in the code review fix (CR-03): `build-linux` uploads the manifest a second time as the data-only artifact `release-linux-manifest`, and it and `release-linux-identity` keep `retention-days: 7`, past the 1440-minute descriptor wait plus approval slack. `descriptor` and `channel-live` download `release-linux-manifest`. The tarball and MAR artifact `release-linux` keeps retention 1. The `release-shape` retention rule now derives the minimum (wait_timer / 1440 + 2 days) from `.github/settings/environment-descriptor.json` for every artifact a job behind the descriptor environment downloads, and refuses a tarball or a MAR in such an artifact. The manifest names the build machine in `host`, so it is now readable as an artifact for 7 days instead of 1.
- ~~`release-manifest.json` is not a Release asset. `descriptor-monotonic` therefore fails on the first published Release, and `channel-live` without `--manifest` cannot derive its values. The manifest's `host` field also names the build machine.~~ Decided 2026-10-31: published as a Release asset (CR-02 fix). sign-publish attaches it under its stable name, hashed in SHA256SUMS; `release-asset-set` expects it; `channel-live` without `--manifest` derives from it, and a Release without it is red naming that Release. `host` stays, because release.yml already names the build machine. IN-03 is fixed in the same pass: both release.yml agreement steps call `verify-channel-live.mjs --manifest-agrees`.
- The descriptor environment must see `BOT_APP_CLIENT_ID` and `BOT_APP_PRIVATE_KEY`.
- `channel-live` reads the public updates repo with the job's default token. Confirm this on the first run.

## Known Stubs

None.

## Threat Flags

| Flag | File | Description |
|------|------|-------------|
| threat_flag: write-token | .github/workflows/release.yml | descriptor mints a contents-write App token for powerbrowser-updates; it is minted after every gate and used by one step |

## Self-Check: PASSED

- FOUND: scripts/verify-channel-live.mjs, .github/workflows/release.yml, scripts/verify-update-download-host.mjs
- FOUND commits: c953d2f5, 1f675e39, c57f1fb0, b0c5bd63 (each an ancestor of HEAD)
