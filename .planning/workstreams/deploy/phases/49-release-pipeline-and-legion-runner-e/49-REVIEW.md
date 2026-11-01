---
phase: 49-release-pipeline-and-legion-runner-e
reviewed: 2026-10-31T00:00:00Z
depth: deep
files_reviewed: 9
files_reviewed_list:
  - .github/workflows/release.yml
  - scripts/verify-release-shape.mjs
  - scripts/verify-mar-channel-gate.mjs
  - scripts/verify-release-asset-set.mjs
  - scripts/verify-workflows.mjs
  - scripts/verify-platform.sh
  - scripts/generate.mjs
  - powerbrowser/packaging/package-linux.sh
  - configuration.toml
findings:
  blocker: 2
  warning: 11
  info: 4
  total: 17
status: issues_found
---

# Phase 49: Code Review Report (plans 49-01 and 49-03)

**Range:** 186f465..HEAD on dsh/phase-49. Clone: /home/chris/gsd-workspaces/deploy/dsh/phase-49.

**Verified green (not a finding):** `generate.mjs --check` (56 files), the rows `release-shape`, `mar-channel-gate`, `release-asset-set`, `workflows`, `zizmor` and the three new self-tests all pass. The `legion` job itself references no `secrets.`, has no `environment:` and has `contents: read`. The full-SHA input, HEAD gate and uncached build from 777e0b0 are present and correct as text.

**Method for the "checks cannot go red" findings:** I copied the repo's scripts into a scratch tree (scratchpad r49b, symlinks to everything else), edited a copy of release.yml there, and ran the real rows against each edit. Nothing tracked was touched. Results are quoted per finding.

## Blockers

### BL-01: sign-publish executes `signmar` and shared libraries built on the persistent legion runner, with the signing key, the contents-write token and the OIDC token in reach

**File:** `.github/workflows/release.yml:136-147` (upload), `:169-173` (download), `:181-186` (chmod), `:217`, `:238`, `:249` (execution), `:159-160` (job-level `GH_TOKEN`), `:155-158` (permissions)

**Failure scenario:** `build-linux` runs `./mach build` of upstream code on a persistent self-hosted runner and uploads `objdir-release/dist/bin/signmar` plus every `dist/bin/*.so*` as the `signing-tools` artifact. `sign-publish` (the job that holds `MAR_SIGNING_P12_B64`, `MAR_SIGNING_P12_PASSWORD`, `contents: write`, `id-token: write`, `attestations: write`) downloads that artifact, `chmod +x`es it and runs it with `LD_LIBRARY_PATH` pointing at the downloaded libraries. Anyone who can influence the legion build output (a poisoned toolchain download under `--enable-bootstrap`, a hostile patch or upstream tag, a leftover file on the persistent runner, a modified dispatch-branch workflow) controls that binary. In `sign_mar` (line 238) it runs next to `$WORK/mar.p12`, the password file and the unlocked NSS DB, so it can exfiltrate the MAR signing key, which is the one asset the release environment exists to protect. Every step also sees the job-level `GH_TOKEN` (contents write) and the OIDC request variables, so it can alter Releases or mint attestations as the workflow.

The verification does not save this. `verify_mar` (line 249) is `signmar -v` from the same artifact, so a trojaned `signmar` answers "verified" for anything. The 49-03 SUMMARY calls the tracked DER "the independent comparand", but the program that compares against it is not independent. The channel gate (line 217, `signmar -T`) is likewise answered by the untrusted binary.

This is the exact boundary the plan's design rests on ("sign never touches legion"), and the new artifact crosses it. It is a deviation recorded as Rule 3 in the SUMMARY but its security consequence is not.

**Fix:** The secret-holding job must run nothing the runner produced.
1. Obtain `signmar` on a hosted job with no secrets, from a pinned source: build it there from the pinned ESR tag (`modules/libmar` needs NSS), or use a pinned Mozilla-maintained signer (for example `mardor`, pip with `--require-hashes`), or a Nix derivation pinned by hash. Verify with a tool that is not the one used to sign.
2. If the container build must supply it, commit its sha256 (and the libraries') in a tracked file changed only by a reviewed commit, and have sign-publish check them before first use. This only works if the build is reproducible, so prefer option 1.
3. Independent of that, shrink the blast radius: move `GH_TOKEN` from job `env` (line 159-160) to the steps that need it; split the secret-holding signing into its own job with `permissions: {contents: read}` and no `id-token`; run draft, attest and publish in a later job that never sees the P12.
4. Do not export `LD_LIBRARY_PATH` pointing at runner-supplied `.so` files in any job that holds a secret.

### BL-02: sign-publish takes the commit and the tag name from build-linux outputs and manifest, then runs that commit's code with a write token

**File:** `.github/workflows/release.yml:161` (`RELEASE_SHA: needs.build-linux.outputs.sha`), `:175-179` (checkout), `:192`, `:259`, `:267`, `:281-284`, `:290`, `:310` (`release_key` from the manifest)

**Failure scenario:** The SHA gate (lines 60-77) runs only on the legion runner, and its result travels as a job output. `sign-publish` does not re-run the gate; it checks out whatever commit the output names and then executes that commit's `scripts/verify-release-asset-set.mjs` and `scripts/generate.mjs` (lines 259, 282, 292) with the contents-write `GH_TOKEN` and the OIDC token in the environment. It also reads `powerbrowser/packaging/mozconfig.release` and `mar-primary.der` from that checkout as the "tracked" comparands. A compromised runner can set `outputs.sha` to any commit in the repository (a feature-branch commit with altered scripts, an altered DER, an altered mozconfig), so the "tracked DER" check and the channel check compare against attacker-chosen files, and `gh release create --target "$RELEASE_SHA"` tags that commit. The tag name and every asset name come from `release/release-manifest.json:release_key`, also produced on the runner (lines 192, 281, 290, 310), so the runner picks the public tag as well.

**Fix:**
```yaml
# sign-publish
env:
  RELEASE_SHA: ${{ inputs.sha }}           # the human's dispatch input, not a runner output
steps:
  - uses: actions/checkout@...
    with: { ref: ${{ inputs.sha }}, fetch-depth: 0, persist-credentials: false }
  - name: Re-run the SHA gate on the hosted runner
    run: <same body as sha_gate>
  - name: Manifest key must equal the key derived from this tree
    run: |
      DERIVED="$(node --input-type=module -e "import {resolveConfig,releaseIdentity} from './scripts/generate.mjs'; console.log(releaseIdentity(resolveConfig('./configuration.toml').config).releaseKey)")"
      [ "$(jq -r .release_key release/release-manifest.json)" = "$DERIVED" ] || { echo "::error::manifest release_key differs from the tree"; exit 1; }
```
Use `$DERIVED`, never the manifest value, for `TAG` in every later step.

## Warnings

### WR-01: the legion least-privilege invariant is only checked by the string `secrets.` and is not enforced for permissions

**File:** `scripts/verify-release-shape.mjs:131-139`; `.github/workflows/release.yml:39-40`

**Failure scenario:** The must_have is "contents read, no environment, no secrets". The row checks only `environment` and the substring `secrets.`. Planted in the scratch tree, all of these left `release-shape`, `mar-channel-gate`, `release-asset-set` and `workflows` green (exit 0): build-linux `permissions: {contents: write, id-token: write}`; workflow-level `permissions: contents: write`; `ALL: ${{ toJSON(secrets) }}` in build-linux env; `T: ${{ secrets['MAR_SIGNING_P12_B64'] }}` in build-linux env. A write token or a secret therefore reaches the persistent runner with no row going red. The `write-trio` rule in verify-workflows only fires on the full trio.

**Fix:** In `runChecks`, for every legion job require the effective permissions map to equal `{contents: 'read'}` exactly (job and workflow level), reject `/\bsecrets\b/` (any form, not `secrets.`), reject `github.token`/`GITHUB_TOKEN` writes, and reject any `with: token:` or `ssh-key`. Add a self-test plant for each form above.

### WR-02: the gates can be neutered without any row going red, and the 777e0b0 fix is unguarded

**File:** `scripts/verify-release-shape.mjs:44, 140-163`; `.github/workflows/release.yml:48-51, 66-75, 88-98, 101, 105, 110, 119, 125, 139`

**Failure scenario:** The row proves the gate steps exist and precede the first `podman`/`./mach` step. It never checks that the later steps carry `if: steps.key_gate.outputs.build == 'true'`. In the scratch tree these edits left every release row green: removing the `if:` from the podman image build and from the mach build (the build then runs when the key is not newer); `if [ "$LATEST" = "none" ] ||` changed to `if true ||` (the key gate always builds); removing `--no-cache`; replacing the `[ "$SHA" = "$RELEASE_SHA" ]` check with `:`; replacing the `.github/workflows/` diff with `true`; replacing the `configuration.toml` ancestor test with `grep -q ''`. The row only greps for the text `merge-base --is-ancestor`. The known fix 777e0b0 (40-hex requirement, HEAD equality, uncached build) has no plant at all.

**Fix:** Assert, from the parsed steps, that every step after `key_gate` in build-linux has the exact `if:` expression; assert the presence of the 40-hex step, the `git rev-parse HEAD` equality, the `--no-cache` and `--pull=always` flags, the workflows diff and the configuration.toml test; and plant each removal. Better, extract the comparator and gate bodies to a script (see WR-09) that a self-test can execute against fixture repos instead of grepping YAML.

### WR-03: the sign-publish rows are regex presence checks that miss fail-open edits

**File:** `scripts/verify-mar-channel-gate.mjs:131-133, 147-160`; `scripts/verify-release-asset-set.mjs:196-230`

**Failure scenario:** `/exit 1/.test(gate)` is satisfied by the unrelated `exit 1` of the update-channel cross-check, so deleting the `exit 1` after the MAR mismatch (release.yml:220) leaves the row green; verified in the scratch tree. Also green: `continue-on-error: true` on `mar_channel_gate`; `|| true` appended to `signmar ... -v "$SIGNED"`. Each of those turns the channel gate or the verification into a no-op while the row reports PASS. The self-test plants (lines 222-232) only delete the comparison text or swap names, so they exercise the presence regex, not a fail-open edit.

**Fix:** Reject, for the gate, sign and verify steps (and the publish chain): `continue-on-error`, any `if:` other than the intended one, `|| true`, `|| :`, `set +e`, and a missing `set -euo pipefail`. Require the `exit 1` to be inside the mismatch branch (parse the `if`/`fi` block, or better run the gate body against fixtures with a stub `signmar` and assert the exit code). Add plants for `continue-on-error`, `|| true` and the `exit 1` removal.

### WR-04: `mar_origin` validation is not in generate; the docs claim it is, and a bad value fails after a 50-minute build

**File:** `scripts/generate.mjs:1405-1425`, `scripts/lib/config-schema.json:117-123`, `docs/REBRANDING.md:286`, `powerbrowser/packaging/package-linux.sh:109`

**Failure scenario:** `marOrigin()` is called only from `package-linux.sh`, which runs after `./mach build`. The schema regex `^https://[A-Za-z0-9.-]+$` accepts uppercase and shapes like `https://-x`, while `marOrigin()` refuses any host that changes under `URL` normalisation. With `mar_origin = "https://Downloads.PowerBrowser.org"`, `generate.mjs --check` prints PASS (exit 0, verified in the scratch tree) and so do all `--quick` rows; `marOrigin(config)` then reports the failure only when the packaging step runs, after the 47-54 minute compile. REBRANDING.md says "Generate refuses any value that is not an https origin naming only a host", which is false for that input.

**Fix:** Call `marOrigin(config)` in generate's validation path (where `updateChannel` and `releaseIdentity` are validated) so `generate` and `--check` refuse it, or tighten the schema regex to lowercase `^https://[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$`. Add a `--quick` plant for the uppercase host.

### WR-05: no `concurrency` group; two dispatches race on the persistent workspace and on the tag

**File:** `.github/workflows/release.yml:22-33`

**Failure scenario:** Two dispatches (a double click, or one after a failed run) both pass the key gate while no newer Release exists. If legion has more than one runner, or the second queues behind the first, both reach `sign-publish`; `newer_guard` runs minutes before `publish` and is not rechecked. The second `gh release create` makes a second draft for the same tag, and `gh release view/edit "$TAG"` then picks between drafts by list order. A failed run also leaves a draft that the next run's `gh release create` does not replace.

**Fix:** Add at workflow level:
```yaml
concurrency:
  group: release
  cancel-in-progress: false
```
and in `draft_release` delete a pre-existing draft for the tag first (`gh release delete "$TAG" --yes` only when it is a draft), and re-run `newer_guard` as the step directly before `bot`.

### WR-06: the header says a partial release cannot publish, but sign-publish publishes as soon as a MAR exists

**File:** `.github/workflows/release.yml:19-20, 294-311, 313-338`

**Failure scenario:** The header states that sign-publish, descriptor and channel-live "end in a deliberate failure. A release therefore cannot publish a partial result." Only descriptor and channel-live fail closed. sign-publish ends in `gh release edit --draft=false`. When the missing MAR emit (BLOCKED.md item 6) is added, one dispatch will publish a public, immutable Release and create the tag with no R2 copy (DIST-08: "placed before the single publish so the origin is populated before any Release is public") and no descriptor. The key gate then blocks a corrected re-release at the same key, so the owner must burn a revision.

**Fix:** Until 49-04 and 49-05 land, put a deliberate-failure step directly before `bot` (or `if: false` on `publish`), and correct the header. Remove it in 49-05.

### WR-07: build-linux does not fetch upstream, apply patches or build Theia, and BLOCKED.md does not list this

**File:** `.github/workflows/release.yml:100-122`; `.planning/workstreams/deploy/phases/49-release-pipeline-and-legion-runner-e/BLOCKED.md` (items 6-7)

**Failure scenario:** `upstream/` and `objdir-release/` are gitignored. The checkout step cleans ignored files on a persistent runner, so `upstream/` does not exist when `podman run ... -w /src/upstream` runs, and no step calls `scripts/fetch-upstream.sh` or `scripts/apply-patches.sh`. `package-linux.sh` line 19 also requires `theia/applications/browser/lib/backend/main.js` ("run yarn build in theia/ first"); no step runs `yarn` (the container has no yarn). The first dispatch fails at the build step with a missing directory rather than at any gate. BLOCKED.md names the missing MAR emit and the packaged rows but not these three missing steps, so the owner will believe one gap exists when several do.

**Fix:** Add `fetch-upstream.sh`, `apply-patches.sh` and `nix develop .#theia --command yarn --frozen-lockfile && yarn build` steps (all `if: build == 'true'`) before the container build, and add them to BLOCKED.md as engineering gaps.

### WR-08: asset names and the TSV protocol are built from the unvalidated manifest `release_key`

**File:** `.github/workflows/release.yml:259-270`; `scripts/verify-release-asset-set.mjs:120-132, 255-266`

**Failure scenario:** `--expected` derives every name from `manifest.release_key` and prints `kind<TAB>name` lines; the workflow then runs `cp "$TARBALL" "assets/$NAME"` and `git archive -o "assets/$NAME"` on them. A `release_key` containing `/`, `..`, a tab or a newline writes outside `assets/` or injects extra `notice`/`source` lines. In `--expected` mode there is also no null check on the docs-derived `token` (the `runChecks` guard at lines 158-161 is not used in that mode), so a docs regression yields names such as `powerbrowser-153.5.1-1.null.tar.xz`, which are attested and drafted before the later `--draft` call goes red. The draft equality is also circular: the expected set and the draft both come from the same manifest.

**Fix:** In `--expected` and `--draft` modes require `/^v\d+(\.\d+)*-\d+$/` on `release_key` (or, per BL-02, replace it with the tree-derived key) and call the same `derive` checks as the row; reject any name containing `/`, whitespace or control characters before printing it.

### WR-09: the key comparator silently skips the build on unparseable or longer tags, and it is written twice with no test

**File:** `.github/workflows/release.yml:88-97, 195-200`

**Failure scenario:** The inline JS splits on `.`/`-`, maps `Number`, and loops over `a.length` only. A latest published tag that is not purely numeric (for example a hand-made `v153.5.1-rc1` or `latest`) yields `NaN`; `NaN !== x` is true and `a[i] > NaN` is false, so the process exits 1 ("not newer") and `build=false`. The run ends green having built nothing, and every later dispatch does the same until the tag is deleted. Likewise a key with more components than the tag (`v153.5.1-1.1` vs `v153.5.1-1`) compares `1 > undefined`, false. In sign-publish the same code turns the case into a hard "stale approval" error. Neither copy is executed by any row, so the logic is untested, and the two copies can drift.

**Fix:** Move the comparator to one tested script (for example `scripts/release-key-newer.mjs`, with a `--self-test` over equal, older, newer, longer, shorter and non-numeric inputs), have it fail with exit 2 on a non-numeric tag, and make the key gate treat exit 2 as an error rather than "not newer". Make a "nothing to build" run visible (`::notice::` plus a summary line).

### WR-10: legion mounts the Safe Browsing key into the build container, so "legion holds no secret" is only syntactic

**File:** `.github/workflows/release.yml:111-116`

**Failure scenario:** `PB_KEYDIR` is a repository variable naming a directory of key material on the runner, mounted read-only at `/keys` into a container that runs `./mach build` with network access and `--enable-bootstrap` downloads. No `secrets.` token appears, so the shape row passes, yet the build processes can read `sb-gapi.data`. The key is also embedded in the shipped binary, which limits the damage to quota abuse, but the project's own invariant ("legion holds no secret") is stated without that exception, and the exception is not recorded in the rows or RELEASING.md.

**Fix:** Record the exception explicitly (the key is a shipped-in-binary API key, not a signing or publishing credential) in RELEASING.md and the row's header, or mount the file only into the one `mach` invocation that needs it and run the bootstrap/download phase without it.

### WR-11: nothing in the workflow stops a dispatch from a non-main ref from running on legion; the real control (plan 49-02) is not built

**File:** `.github/workflows/release.yml:36-38, 60-77`

**Failure scenario:** The SHA gate validates the requested commit, not the workflow definition being executed. `workflow_dispatch` runs the workflow file from the ref selected at dispatch. Anyone with write access can dispatch from a feature branch whose release.yml adds a step on `[self-hosted, powerbrowser-release]` (or drops the gates). That step runs on the persistent runner that mounts the Safe Browsing key and whose `_work` and image store persist across runs. A guard inside the file does not help because the branch copy can delete it. `sign-publish` is protected only if the `release` environment has a main-only branch policy, which is not asserted anywhere in the tree.

**Fix:** Plan 49-02 must register the runner in a runner group restricted to `Deocracy/powerbrowser` workflow `release.yml@refs/heads/main`, and `.github/settings/` should carry (and a row should assert) the environment `deployment_branch_policy` for `release` and `descriptor`. As a cheap accident guard add `if: github.ref == 'refs/heads/main'` on every job.

## Info

### IN-01: `set -o pipefail` with early-exit consumers can fail spuriously

**File:** `.github/workflows/release.yml:71, 217`

`git show --name-only ... | grep -qx 'configuration.toml'` and `signmar -T | sed ... | head -n 1 | tr` close the pipe early. With pipefail an upstream process killed by SIGPIPE makes the substitution or `if` fail. For a configuration.toml-changing commit that touches enough files, the gate would wrongly report "does not change configuration.toml". It fails closed, so it is a nuisance only. Use `grep -x ... >/dev/null` without `-q`, and `sed -n '...{p;q}'` instead of `head`.

### IN-02: rootless podman user mapping is unmeasured

**File:** `.github/workflows/release.yml:115, 122`; `powerbrowser/packaging/Containerfile:81-85`

The image runs as non-root `builder`, and `podman run -v "$PWD:/src:rw"` has no `--userns=keep-id`. Under rootless podman the workspace is owned by the runner user, which maps to container root, so `builder` may be unable to write `objdir-release/`; conversely files it does write map to subuids that the next `actions/checkout` `git clean -ffdx` cannot delete. BLOCKED.md item (unrun-verify) covers "never run" generally but not this. Verify on the first run and add `--userns=keep-id:uid=1000,gid=1000` if needed.

### IN-03: the build-provenance attestation names the hosted sign job, not the legion build

**File:** `.github/workflows/release.yml:272-275`

`attest-build-provenance` runs in sign-publish and attests bytes that were built elsewhere, so the provenance records the signing job's workflow identity, not the builder. A consumer reading it can conclude the artifacts were built on a GitHub-hosted runner. State this limit in RELEASING.md, or attest from build-linux if that job is ever given `id-token` (it must not be, per the invariant).

### IN-04: artifact names collide on a job re-run

**File:** `.github/workflows/release.yml:124-147`

`upload-artifact` v4+ rejects a second artifact of the same name in a run, so re-running only `build-linux` after a late failure conflicts with the stale `release-linux` and `signing-tools` (retention 1 day, no `overwrite`). The owner must run a fresh dispatch, which is acceptable but should be recorded in RELEASING.md. Post-publish deletion of the artifacts is still not wired (BLOCKED.md item 9).

---

_Reviewed: 2026-10-31_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: deep_
