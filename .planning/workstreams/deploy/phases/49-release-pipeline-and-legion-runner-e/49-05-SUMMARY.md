---
phase: 49-release-pipeline-and-legion-runner-e
plan: 05
subsystem: release-pipeline
status: partial
tags: [release, toolchain, auto-05, dist-08, inf-04, r2, mar-origin, allowlist]
requires:
  - 49-01 (build-linux container steps, toolchain-baseline.sh --container)
  - 49-03 (sign-publish, the r2_gate placeholder, release-asset-set)
  - 49-04 (descriptor and channel-live, the MAR-origin form gate, release-manifest.json as a Release asset)
provides:
  - scripts/verify-toolchain-container.mjs (runChecks, emitterLines; --measured build gate; --self-test)
  - registry rows toolchain-container and toolchain-container-self-test (quick)
  - release.yml build-linux drift step, after the in-container measurement and before packaging
  - release.yml sign-publish r2_copy step (write-once wrangler r2 object put at <tag>/<asset>, sha512 read-back), replacing r2_gate
  - .github/r2/wrangler lockfile (wrangler 4.94.0)
  - release-asset-set rules r2-copy and cloudflare-scope, eight new plants
  - endpoint-allowlist allow row downloads.powerbrowser.org (manifest urls.mar_origin); release-assets row user-initiated
  - docs/RELEASING.md section "R2 primary MAR origin (DIST-08)" with the owner setup, holder map rows and withdraw reference
affects:
  - scripts/generate.mjs (manifestEndpointSources covers urls.mar_origin; self-test fixture)
  - scripts/verify-no-build-date-pin.mjs (PIN and PIN_VARIABLES exported)
  - scripts/toolchain-baseline.sh (header comments only)
  - website-staging/privacy.html (update download host)
  - docs/RENEWALS.md, docs/REBRANDING.md, BLOCKED.md
tech-stack:
  added: [wrangler 4.94.0 (sign-publish only, committed lockfile, npm ci --ignore-scripts), actions/setup-node v7.1.0 (949feb24)]
  patterns: [one script as quick row and build gate (--measured), derive keys and forms from the emitter, write-once object copy with read-back]
key-files:
  created:
    - scripts/verify-toolchain-container.mjs
    - .github/r2/wrangler/package.json
    - .github/r2/wrangler/package-lock.json
  modified:
    - .github/workflows/release.yml
    - scripts/verify-platform.sh
    - scripts/verify-release-asset-set.mjs
    - scripts/verify-no-build-date-pin.mjs
    - scripts/toolchain-baseline.sh
    - scripts/generate.mjs
    - powerbrowser/endpoint-allowlist.json
    - website-staging/privacy.html
    - docs/RELEASING.md
    - docs/RENEWALS.md
    - docs/REBRANDING.md
    - .planning/workstreams/deploy/phases/49-release-pipeline-and-legion-runner-e/BLOCKED.md
decisions:
  - "The build-time drift comparison is verify-toolchain-container.mjs --measured, the same code as the quick row, so the self-test plants exercise the gate the build runs."
  - "The drift step runs after ./mach build (the bootstrap toolchain exists only inside that container run) and before the package step and every upload, so a drifted toolchain never reaches an artifact."
  - "r2_copy writes the versioned signed MAR only, the key the descriptor names; the stable-name MAR stays a Release asset."
  - "Every wrangler r2 object call passes --remote: wrangler 4.x defaults these commands to local storage."
  - "A key counts as free only when the get fails with 'The specified key does not exist.'; wrangler 4.94.0 exits 1 for every failure, so any other get error fails closed."
  - "Tag and asset names in r2_copy come from derive_key and the --expected list (tree-derived), never from the manifest."
metrics:
  duration: about 30 minutes of wall clock between plan start and the Task 2 commit (22:38 to 23:05), most of it the three --quick runs
  completed: 2026-10-31
actuals:
  tokens: 20100
  tasks: 2
  commits: 2
plan_head_before: a5f93b418e0632bbdb044f9341588594232facf6
plan_head_after: c6cd56c2b1b56be15cbc257551bbd6acfc081816
---

# Phase 49 Plan 05: toolchain pin and R2 primary MAR origin Summary

The release build now measures the container toolchain and refuses any drift from `toolchain-baseline.txt` before anything is packaged. sign-publish copies each signed MAR, write-once, to the R2 primary origin at `<tag>/<asset>` before the single publish. The allowlist, the endpoint derivation, the privacy page and the release docs follow the 2026-10-29 ruling. Task 3, the owner checkpoint, was not executed (by instruction). Its owner steps are listed below.

## Commits

| Task | Commit | Subject |
| ---- | ------ | ------- |
| 1 | f3517563 | feat(49-05): toolchain-container row refuses container toolchain drift before packaging |
| 2 | c6cd56c2 | feat(49-05): R2 primary-origin copy of each signed MAR, write-once at <tag>/<asset> |
| 3 | not executed | owner checkpoint (R2 enablement, token placement, BUILD.md INF-04 rows) |

`git rev-list --count a5f93b41..c6cd56c2` = 2.

## Task 1: toolchain-container

- In `build-linux`, the build step now writes `toolchain-baseline.sh --container` output to `objdir-release/toolchain-measured.txt`, inside the same container run as `./mach build`. The next step runs `nix develop .#theia --command node scripts/verify-toolchain-container.mjs --measured objdir-release/toolchain-measured.txt` and carries the key-gate `if:`.
- The static row checks four things:
  - That wiring, with the drift step after the build, before packaging and every upload, and never failing open.
  - The baseline's keys and value forms, derived from the emitter's `--container` block.
  - The baseline's `# base` digest and apt snapshot against the Containerfile.
  - That no build-date pin appears in the workflow, the Containerfile, the baseline or the measured output. The pattern is imported from `verify-no-build-date-pin.mjs`, so the token is never spelled in the new file.
- `node scripts/verify-toolchain-container.mjs` passes on the tree with a note: four lines are UNMEASURED (clang, sysroot, sysroot-glibcxx, image). The build-time step therefore refuses every release until those lines are copied from a container build.

### toolchain-container --self-test (4 ok lines, 11 plants in 3 families)

```
  ok  green: the tree's workflow, baseline, Containerfile and emitter, and a fully measured container output equal to the baseline
  ok  drifted rustc line -> red naming the drift, by every route: the container prints another rustc; a baseline rustc the emitter cannot print; the drift step removed; the drift step after the package step; the drift step failing open
  ok  drifted image digest -> red naming the drift, by every route: the baseline base pin off the Containerfile FROM; the Containerfile FROM re-pinned without the baseline; the apt snapshot off the Containerfile
  ok  pinned MOZ_BUILD_DATE -> red naming the drift, by every route: in the build step env; in the Containerfile; in the measured output
toolchain-container: --self-test PASS -- the green control first, then 11 plants in 3 families each went red naming the drift. It writes nothing.
```

The plan's verify requires exactly four lines that contain `ok`. Each line therefore covers one fault family, and the line fails if any plant in that family escapes. Two concurrent self-test runs and one row run left `git status` unchanged (the concurrency backstop).

## Task 2: R2 primary-origin copy

- The `r2_copy` step replaces `r2_gate`, between `asset_set` and `newer_guard_final`. For each versioned MAR in the `--expected` list it does the following:
  - `wrangler r2 object get --remote`. If the key holds the same sha512, the step logs a no-op. If it holds other bytes, the step fails with "refusing to overwrite". It treats the key as free only on wrangler's "The specified key does not exist." message.
  - `wrangler r2 object put --remote`, then a read-back get, and the sha512 must match.
  - Without the bucket, account and token it fails closed, and its error names the RELEASING section. A bucket name that is not valid also fails closed.
- Before the step, two steps prepare wrangler with no credential: setup-node v7.1.0 (Node 24, `package-manager-cache: false`), and `npm ci --ignore-scripts` from `.github/r2/wrangler`. I checked the package identity before writing the lockfile: `wrangler@4.94.0`, repository cloudflare/workers-sdk, publisher `wrangler-publisher <workers-devprod@cloudflare.com>`. 4.94.0 is the version the tree's `flake.lock` resolves.
- I checked the wrangler subcommands against the 4.94.0 tarball source: `r2 object get|put <bucket>/<key> --remote --file`. Local storage is the default without `--remote`. A missing key raises UserError "The specified key does not exist.". Uploads are capped at 300 MiB, and the token comes from `CLOUDFLARE_API_TOKEN`.
- I simulated the step with a fake wrangler. Every case behaved as intended:

| Case | Exit | Result |
|------|------|--------|
| absent key | 0 | copied |
| rerun with the same bytes | 0 | no-op |
| other bytes at the key | 1 | refusing to overwrite |
| other read error | 1 | could not read |
| read-back mismatch | 1 | red |
| no token | 1 | fails closed |
| bad bucket name | 1 | fails closed |
| no versioned MAR | 1 | red |

- The plan's Cloudflare count check: `CLOUDFLARE_` appears in no other workflow, and 3 lines in release.yml equal the 3 lines inside the R2 step range. `release-asset-set` now enforces the same property structurally: a Cloudflare credential, or the token's secret name, in any other step or workflow file is red.

### release-asset-set --self-test: 28 ok lines (baseline plus 27 plants). The new R2 plants:

```
  ok  R2 copy removed -> red, naming 'no r2_copy step'
  ok  R2 copy moved after the publish -> red, naming 'no r2_copy step'
  ok  continue-on-error on the R2 copy -> red, naming 'r2_copy step carries continue-on-error'
  ok  R2 put without --remote -> red, naming 'without --remote'
  ok  R2 read-back removed -> red, naming 'write-once origin is not proven'
  ok  R2 overwrite refusal removed -> red, naming 'write-once origin is not proven'
  ok  R2 token in another step -> red, naming 'Re-check that no newer Release'
  ok  Cloudflare credential in another workflow -> red, naming 'Cloudflare credential; only'
```

### Allowlist and endpoint coverage

- New `allow` row `downloads.powerbrowser.org`, placed after the updates row, with `"manifest": "urls.mar_origin"`. It cites UPD-15, DIST-08 and the 2026-10-29 ruling.
- `mar_origin` was added to the key list in `manifestEndpointSources`, so `generated/endpoint-hosts.json` now lists the host. generated/ was regenerated.
- **release-assets inspection.** No tree check requires an `allow` row:
  - `allowlist-schema` accepts all three dispositions (`DISPOSITIONS` in `scripts/lib/endpoint-verdict.mjs`).
  - `allowlist-doc-consistency` reads only Mozilla allow hosts.
  - `run_disposition_self_test` in `verify-endpoints.sh` uses fixture hosts only.
  - `verify-mar-update-hop.mjs` already forbids the host in a release resolver log.
  - The row is now `user-initiated` with the reworded reason.
- The github.com and updates reasons were reworded as the plan specifies.

### Release docs

`docs/RELEASING.md` changes:
- The architecture paragraph now gives the real release flow: copy before publish, the descriptor job commits after the wait and approval, the MAR comes from R2, and the Release is the archival copy.
- The fail-closed sentence is updated.
- New section "R2 primary MAR origin (DIST-08)" covers:
  - write-once keys and the copy semantics;
  - the wrangler pin and its 300 MiB limit;
  - the owner setup;
  - "Releases are never deleted";
  - the withdraw path (REL-02, Phase 50), which is no-update only.
- Secrets inventory: rows for `R2_MAR_WRITE_TOKEN` (one holder, the RENEWALS row), and for `R2_MAR_BUCKET` and `CLOUDFLARE_ACCOUNT_ID` as variables. A paragraph states that the sweep holds no Cloudflare token.
- The liveness step names `channel-live` and `scripts/verify-channel-live.mjs`, and requires an https MAR-origin URL with path `/<tag>/<asset>`.
- The patch-URL paragraph is reworded.
- The Cloudflare upkeep paragraph names the MAR bucket next to the crash bucket.
- A runner-online note is added under Runner upkeep.
- The verification map now lists `channel-live` and `toolchain-container`.

The `docs/RENEWALS.md` scope sentence now allows the one `r2_copy` reference.

## Task 3: not executed (owner checkpoint, blocking-human)

Owner steps (also in BLOCKED.md section "49-05" and the RELEASING R2 section):

1. Enable Cloudflare R2 on the account (a payment method may be asked for).
2. Create the MAR bucket, the primary origin.
3. Attach `downloads.powerbrowser.org` to that bucket as its custom domain with public read, and leave the `r2.dev` URL off. Confirm in the dashboard that the custom domain shows active and that `r2.dev` access is off.
4. In the `release` environment, set the variables `R2_MAR_BUCKET` and `CLOUDFLARE_ACCOUNT_ID`. Neither is a secret.
5. Create an R2 API token with object read and write on the MAR bucket only (the read-back needs read). Store it as the `release` environment secret `R2_MAR_WRITE_TOKEN` and nowhere else.
6. Record the holder and the date on the RENEWALS row "Cloudflare R2 object-write token" (DOC-04).
7. Reply with the holder, the date, the bucket name and the dashboard state. No token value.

R2 holder reply: none yet. Task 3 was not run.

BUILD rows: not written. The executor half of Task 3 is in `docs/BUILD.md`: the INF-04 cold hosted fallback procedure with its empty measured row, and the per-release artifact-size row against the 500 MB cap (retention-days 1 plus deletion after publish). It was held because the instruction was not to execute Task 3. No measured numbers are claimed anywhere.

## Flagged-assumption outcomes

- **AUTO-05.** All three named drift shapes are red, along with the routes by which they could escape: the gate missing, moved after packaging, or failing open. Two shapes the row does not catch:
  - A drift in a baseline line whose value matches the emitter form but is a typed wrong value. That is caught only at build time by `--measured`, because no quick derivation of a bootstrap version exists.
  - Drift in the per-key value grammar. The grammar is derived from the emitter's `--version` and `echo` lines, and a `shortcut:` comment marks the x.y.z assumption.
- **DIST-08.** The copy runs before the publish (plan 49-03 ordering). A rerun at the same key is idempotent through the same-bytes no-op. The concurrency group `release` admits one run at a time, so the read-then-put is not raced.
- **INF-04.** Not executed. The procedure and both rows are pending Task 3.

## Deviations from Plan

1. **[Rule 3] The drift gate follows the build.** The plan says "after bootstrap and before the build". The bootstrap happens inside `./mach build` in a `--rm` container, so the gate runs after it and before packaging and every upload. (f3517563)
2. **[Rule 3] The build-time comparator is the node row (`--measured`), not the shell `drift()`.** This puts one code path behind both the row and the gate. The `toolchain-baseline.sh` header comments were corrected, and its own self-test is unchanged. (f3517563)
3. **[Rule 3] `verify-no-build-date-pin.mjs` exports `PIN` and `PIN_VARIABLES`.** Without them the new row would have to spell the token, which `no-build-date-pin` reds. (f3517563)
4. **[Rule 3] A wrangler source was required.** The plan names `wrangler r2 object put` but no install. I added the committed-lockfile pattern (precedent: `.github/fixer/claude-cli`) and setup-node, because wrangler 4.94.0 requires Node 22 or later. (c6cd56c2)
5. **[Rule 2] The structural R2 checks are in `release-asset-set`, beyond the plan's one-off greps**, so the write-once and Cloudflare-scope properties stay enforced. (c6cd56c2)
6. **[Rule 1] privacy-hosts and generate-self-test went red** once `mar_origin` joined the endpoint sources. `website-staging/privacy.html` now lists `downloads.powerbrowser.org` as the update download host in place of release-assets. The website copy must be re-synced at the next website push. The generate fixture states `mar_origin` and expects its host. (c6cd56c2)
7. **[Rule 3] Two pre-existing literal ESR tag names in `docs/RELEASING.md`** (a stage table row and the 175 uptake paragraph) failed the plan's `! grep -qE 'FIREFOX_[0-9]'` check. They are reworded to "the 153.2.0 ESR release tag" and "the 153.23.0 ESR release tag". (c6cd56c2)
8. `docs/REBRANDING.md` `urls.mar_origin` row: the Reaches cell adds endpoint-hosts coverage. `BLOCKED.md` item 11 is marked resolved, and a 49-05 section is added.

## Verification

- Task 1 chain:
  - `--only toolchain-container-self-test`: PASS.
  - `--self-test | grep -c ok`: 4.
  - `--only toolchain-container`: PASS.
  - `grep -Fc` of each registry row: 1. The plan's non-`-F` grep prints 0 because of the `$` mid-pattern quirk 49-04 recorded.
- Task 2 chain: every step passed, including:
  - the Cloudflare count equality and the put-before-`gh release edit` order;
  - the RELEASING greps and the allowlist node check;
  - the brand scan;
  - `--only` release-shape, allowlist-schema, allowlist-doc-consistency, theia-endpoints and endpoint-dispositions-self-test.
- Also green with `--only`: zizmor (1.29.0 offline, no findings), workflows, release-asset-set and its self-test, update-download-host, repo-slug-derived, no-build-date-pin and its self-test, privacy-hosts, generate-self-test, generate-check.
- Final `scripts/verify-platform.sh --quick`: 260 PASS. Red: single-copy-deps, ng086-theia-react-node, gui07-strip-spike-verdict, gui07-strip-spike-verdict-self-test, gui09-dependent-window-content and gui09-dependent-window-content-self-test, the six known worktree-environment rows. `fixer-isolate-self-test` passed on the first run.
- `website-publish-ready` (full tier, not in `--quick`) is red on pre-existing owner placeholders in `website-staging/`. That is unchanged by this plan.

## Known Stubs

None. The UNMEASURED baseline lines and the absent R2 secrets are deliberate fail-closed states that wait on owner and first-run actions.

## Threat Flags

| Flag | File | Description |
|------|------|-------------|
| threat_flag: third-party-code-with-credential | .github/workflows/release.yml | wrangler (93 locked npm packages, integrity-pinned, scripts off) runs with the R2 token in the r2_copy step of the write job; the token is bucket-scoped |
| threat_flag: new-action | .github/workflows/release.yml | actions/setup-node v7.1.0 pinned by SHA in sign-publish (default github.token input used for the Node download) |

## Self-Check: PASSED

- FOUND: scripts/verify-toolchain-container.mjs, .github/r2/wrangler/package.json, .github/r2/wrangler/package-lock.json
- FOUND commits: f3517563, c6cd56c2 (each an ancestor of HEAD)
