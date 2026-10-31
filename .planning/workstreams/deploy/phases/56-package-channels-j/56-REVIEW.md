---
phase: 56-package-channels-j
reviewed: 2026-10-31T00:00:00Z
depth: deep
files_reviewed: 28
files_reviewed_list:
  - .github/workflows/channel-manifests.yml
  - flake.nix
  - nix/pkg/powerbrowser-bin.nix
  - nix/pkg/release-hash.json
  - nix/cache.json
  - flatpak/org.debios.PowerBrowser.json
  - flatpak/org.debios.PowerBrowser.desktop
  - homebrew-tap/Casks/powerbrowser.rb
  - winget/DeBIOSFoundation.PowerBrowser.yaml
  - winget/DeBIOSFoundation.PowerBrowser.installer.yaml
  - winget/DeBIOSFoundation.PowerBrowser.locale.yaml
  - scripts/lib/channel-identity.mjs
  - scripts/verify-channel-release-jobs.mjs
  - scripts/verify-flake-repack.mjs
  - scripts/verify-flathub-manifest.mjs
  - scripts/verify-homebrew-cask.mjs
  - scripts/verify-winget-manifest.mjs
  - scripts/verify-binary-cache.mjs
  - scripts/verify-policies-update-split.mjs
  - scripts/verify-platform.sh
  - docs/RENEWALS.md
  - docs/cache-flathub-checkpoint.md
  - docs/channel-train-mapping.md
  - docs/download-flatpak.md
  - docs/download-nix.md
  - docs/winget-tap-checkpoint.md
  - .planning/workstreams/deploy/phases/56-package-channels-j/BLOCKED.md
  - .planning/workstreams/deploy/phases/56-package-channels-j/56-0{1,2,3,4}-PLAN.md (must_haves)
findings:
  critical: 4
  warning: 11
  info: 5
  total: 20
status: issues_found
---

# Phase 56: Code Review Report

**Reviewed:** 2026-10-31
**Depth:** deep
**Files Reviewed:** 28
**Status:** issues_found

## Summary

Every Phase 56 quick row passes (`verify-platform.sh --quick`: all PASS, 14 new rows, `generate.mjs --check` PASS with
68 files, `nix flake check --no-build` passes, the package derivation evaluates). The rows prove the shape of the files.
They do not prove that the files do what the phase says, and four defects make the shipped channel path wrong:

- the four live legs are gated on `github.event_name == 'workflow_call'`, which is never true inside a called workflow
  (the `github` context is the caller's), so from the train no live leg runs and the dry run runs instead;
- the tap leg publishes a caller-supplied, unvalidated, unverified digest, renders a fixture asset name, and does not run
  the `--release` refusal that exists to stop exactly that;
- the Flatpak manifest cannot build (default archive `strip-components: 1` against `cp -a powerbrowser`);
- the Flatpak manifest uses `org.mozilla.firefox.BaseApp` as `runtime`, and the quick row pins that value.

The supply-chain answers to the focus questions:

| Question | Answer |
| --- | --- |
| Flake hash source | Computed by the workflow from the downloaded asset (`nix store prefetch-file`). The caller's `tarball_sha256` is an optional cross-check, skipped when empty. Trust is first-fetch of the public asset, not `SHA256SUMS` or the build attestation that release.yml already produces (WR-02). |
| Flatpak sha256 | Rendered from the same hash record, by hand, by the owner (`--render`). Not in any workflow. Same trust root. |
| winget InstallerSha256 | Computed by `wingetcreate update` from the downloaded installer. Good. The tracked `winget/` set is not used by the leg (WR-07). |
| cask sha256 | Trusted from the caller, never recomputed, never validated (CR-02). |
| Placeholder reaching a publisher | `release-hash.json` sentinel: no (fetchurl fails on mismatch, and `--release` runs in `flake-hash-pr`). Cask fixture asset name: yes (CR-02). `--release` for cask, winget, Flathub and cache is wired into no publishing path. |
| WINGET_TOKEN | Step-scoped env in one step, correct. It is a classic PAT on the owner account in the `release` environment that also holds the MAR signing key and the R2 token (WR-06). |
| Bot App token scope | flake leg: contents + pull-requests write on `powerbrowser` only. Tap leg: contents write on the tap only. Both minimal. The row asserts neither (WR-09). |
| Nix package | allowUnfreePredicate is scoped to the name `powerbrowser` and the devShells keep plain `pkgs`. No impure fetch. DisableAppUpdate is only in `$out`. The dlopen libraries are unreachable (WR-08). |
| nixConfig deferral | Correct (see IN-03). |

## Critical Issues

### CR-01: The live legs are gated on `github.event_name == 'workflow_call'`, which is false in a called workflow; from the train the dry run runs and nothing is published

**File:** `.github/workflows/channel-manifests.yml:80,102,165,225,262`
**Issue:** In a reusable workflow the `github` context belongs to the caller. `github.event_name` is the caller's event,
never `workflow_call`. The train (`release-train.yml`) and `release.yml` are both `workflow_dispatch`-only. Called from
either, the five `if:` expressions evaluate as follows:

- `dry-run` (`github.event_name == 'workflow_dispatch'`) is true. It runs, and renders payloads nobody reads.
- `flake-hash-pr`, `tap-commit`, `winget-submit` and `checker-freshness` (`== 'workflow_call'`) are false. All four are skipped.

A skipped job counts as success, so the stage ends green on every release while the flake hash PR, the tap commit, the
winget submission and the checker check never happen. `channel-release-jobs` cannot see this: it never evaluates an `if:`,
and no self-test plants a wrong event gate. `docs/channel-train-mapping.md` ("`workflow_dispatch` runs the `dry-run` job alone")
documents the same wrong premise. Plan 56-05 would find this only when the owner runs it live.
**Fix:** Do not discriminate on `github.event_name`. Use the input the caller controls:

```yaml
on:
  workflow_call:
    inputs:
      dry_run: { type: boolean, required: false, default: false }
      # release_key ...
  workflow_dispatch:
    inputs:
      release_key: { required: true, type: string }
# dry-run job:  if: ${{ inputs.dry_run || github.event_name == 'workflow_dispatch' && github.workflow == 'Channel manifests' }}
# live legs:    if: ${{ !inputs.dry_run }}   (workflow_dispatch has no dry_run input, so a direct dispatch is also non-live: add `&& github.event_name != 'workflow_dispatch'` only if the direct dispatch must stay dry)
```

A simpler and sturdier shape is to split the dry run into its own `workflow_dispatch`-only file and leave
`channel-manifests.yml` `workflow_call`-only, so no expression needs the event. Add a row case that parses each job's `if:` and
fails when it mentions `github.event_name`, plus a self-test plant for it.

### CR-02: tap-commit publishes a caller-supplied, unvalidated, never-recomputed digest, against a fixture asset name, straight to the tap's default branch, with no `--release` refusal

**File:** `.github/workflows/channel-manifests.yml:163-221` (digest at 198-205); `scripts/lib/channel-identity.mjs:49-50`; `homebrew-tap/Casks/powerbrowser.rb:9-10`
**Issue:** Three defects in one leg, all on the focus path "hash from a trusted source before publishing":

1. `DMG_SHA` is `inputs.dmg_sha256`, used as is. The workflow never downloads the disk image and never recomputes or compares the
   digest, unlike the flake leg. It is also not checked as 64 hex characters. A wrong, empty-after-trim, or attacker-influenced
   value becomes the cask's `sha256` and is pushed to the tap with no review.
2. The URL comes from the `@MACOS_DMG_ASSET@` token, which `channelTokenValues` fills with the fixture name
   `powerbrowser-<v>.macos-universal.dmg` (A3). There is no input for the real asset name, so the leg cannot render a correct cask for
   any real Phase 55 asset unless it happens to be named like the fixture. Otherwise it publishes a cask whose URL 404s.
3. `scripts/verify-homebrew-cask.mjs --release` is the refusal that rejects the fixture, and it does go red today (checked:
   "names a fixture disk image ... A3"). It is not run in `tap-commit`. The refusal exists only as a manual option and the quick row.
   The sentinel-style protection that `flake-hash-pr` has (`verify-flake-repack.mjs --release` before the PR) is missing here.

**Fix:** In `tap-commit`, download the asset named by a new `dmg_asset` input (not a fixture constant), compute the digest in the job,
and fail on mismatch with `dmg_sha256`:

```bash
curl -fsSL -o "$RUNNER_TEMP/app.dmg" "https://github.com/$REPO/releases/download/$KEY/$DMG_ASSET"
GOT="$(sha256sum "$RUNNER_TEMP/app.dmg" | cut -d' ' -f1)"
[[ "$DMG_SHA" =~ ^[0-9a-f]{64}$ ]] && [ "$GOT" = "$DMG_SHA" ] || { echo "tap-commit: FAIL digest mismatch" >&2; exit 1; }
```

Then run `node scripts/verify-homebrew-cask.mjs --release` against the rendered cask (or the tree) before the push, and have the
`channel-release-jobs` row require that string in the tap job (the flake job's equivalent is also unchecked, see WR-09). Consider a PR
to the tap rather than a direct push so a human sees the hash change.

### CR-03: The Flatpak build cannot succeed: `archive` sources strip one path component by default, so `cp -a powerbrowser /app/lib/powerbrowser` copies the launcher binary, then the policies edit fails

**File:** `flatpak/org.debios.PowerBrowser.json:23-24,35-39`
**Issue:** `package-linux.sh` creates the tarball with `tar -C $OBJ/dist -cJf ... "$(basename "$STAGE")"`, so everything sits under
one top-level directory (the Nix derivation relies on this: `test -d $out/lib/powerbrowser`). flatpak-builder's `archive` source has
`strip-components` defaulting to 1, and the manifest does not set it. The top-level directory is therefore stripped and the files land
directly in the module build directory. `cp -a powerbrowser /app/lib/powerbrowser` then copies the `powerbrowser` launcher file to the
path `/app/lib/powerbrowser`. The next command writes `/app/lib/powerbrowser/distribution/policies.json`, which does not exist
(`NotADirectoryError`). No row catches it; `flathub-manifest`/`policies-update-split` match the text of the python assignment only.
**Fix:** Keep the tarball layout and say so: add `"strip-components": 0` to the archive source (or change the commands to
`cp -a . /app/lib/powerbrowser` and drop the stripped layout everywhere). Add a row check that derives the tarball top-level name
from `package-linux.sh`/the derivation's `test -d` and compares it with the manifest's `strip-components` and copy source.

### CR-04: `runtime` is set to the BaseApp ref and `runtime-version` to `stable`; the row enforces the wrong value

**File:** `flatpak/org.debios.PowerBrowser.json:3-5`; `scripts/verify-flathub-manifest.mjs:55,120-123,273-274`
**Issue:** `org.mozilla.firefox.BaseApp` is a base application, not a runtime. Flathub's Firefox-style manifests use
`"runtime": "org.freedesktop.Platform"`, `"runtime-version": "<yy.mm>"`, `"sdk": "org.freedesktop.Sdk"`, plus
`"base": "org.mozilla.firefox.BaseApp"`, `"base-version": "<yy.mm>"`. With the current values `flatpak-builder` cannot resolve a runtime
named `org.mozilla.firefox.BaseApp` at branch `stable`, and the manifest's `sdk` is paired with a runtime of a different kind. BLOCKED
item 3 lists this as "offline-unverified", but the row goes further and turns the guess into a requirement: it goes red when someone
sets `runtime` to `org.freedesktop.Platform`, and the self-test case "runtime off the Firefox BaseApp" plants exactly the correct value
as the fault. The exception request text in `docs/cache-flathub-checkpoint.md` also says "repacks that tarball on the
org.mozilla.firefox.BaseApp runtime". The Flatpak is therefore guarded against being fixed.
**Fix:** Change the manifest to `runtime`/`runtime-version`/`sdk` on `org.freedesktop.*` with a pinned `yy.mm` branch and add `base` +
`base-version`. Change the row to require `base === BASEAPP_REF` and a `runtime-version` that matches `^\d{2}\.\d{2}$`, and flip the
self-test plant to a wrong or missing `base`. Run `flatpak-builder --show-manifest` and a local `--force-clean` build before the
Flathub exception request, not after.

## Warnings

### WR-01: Unvalidated caller inputs flow into a sed program and a URL (sed `e`/`w` command injection)

**File:** `.github/workflows/channel-manifests.yml:198-205,244-250`
**Issue:** `DMG_SHA` is interpolated by jq into `s|@MACOS_DMG_SHA256@|<value>|g` and the file is run with `sed -f`. Reproduced
locally: the value `x|g;1e id>/tmp/pwn;s|a|b` yields the line `s|@MACOS_DMG_SHA256@|x|g;1e id>/tmp/pwn;s|a|b|g`, which GNU sed
executes (the `e` command runs a shell command; `w` writes files). The caller is trusted today, but the stage already treats the train
as a boundary (`derive` validates the key), and this input is the only one with no validation. `winget_asset` is similarly pasted into
a URL (no character-class check), and a value containing `&`, `\` or `|` in any facts value would corrupt the sed replacement (the
dry-run uses `split/join`, so dry run and live render can differ).
**Fix:** Validate every free-text input once in `derive` (`^[0-9a-f]{64}$` for both digests; `^[A-Za-z0-9._-]+$` for `winget_asset`),
and render with the same function the dry run uses (`node ... --render`, which is `split/join`) instead of a generated sed script.

### WR-02: The flake hash is trust-on-first-fetch; the caller's digest is optional and the published `SHA256SUMS` and build attestation are not used

**File:** `.github/workflows/channel-manifests.yml:20-27,132-143`
**Issue:** `tarball_sha256` defaults to `""`, and `[ -n "$TARBALL_SHA" ]` silently skips the cross-check. With no input, the hash recorded
in `release-hash.json` is whatever the public URL served at that moment, with no independent source. `release.yml` already publishes
`SHA256SUMS` and runs `actions/attest-build-provenance` over every asset, so a trusted source exists and is ignored. The input is also
described as "from the release" with nothing saying which job computes it (build-linux output is declared untrusted data in
release.yml's header, so it must not be the source). The same applies to the Flatpak `sha256`, which comes from the same record.
**Fix:** Make `tarball_sha256` required for the live leg (fail when empty), derive it in the train from `SHA256SUMS` of the draft the
sign-publish job verified, and add `gh attestation verify "$TARBALL" --repo "$GITHUB_REPOSITORY"` before writing the record. Have the row
fail when the `-n` guard is absent or the default is non-empty-optional.

### WR-03: No dry-run input and no train-side gate, against the phase's own A6 rule

**File:** `.github/workflows/channel-manifests.yml:29-55`; `docs/channel-train-mapping.md:8-20`
**Issue:** `release-train.yml` carries a negated `inputs.dry-run` in the `if:` of every step that commits, opens, comments or dispatches.
The stage takes no `dry_run` input, so a train dry run that calls it would push a branch, open a PR, commit to the tap and submit to
winget. The mapping doc's call contract has no `if: ${{ !inputs.dry-run }}` on the calling job either. There is also no `concurrency`
group, so two calls for the same key race on `chore/channel-<key>` and on the tap.
**Fix:** Add the `dry_run` input from CR-01 and gate every live job and the token mint on it; add `concurrency: { group: channel-${{ inputs.release_key }}, cancel-in-progress: false }`; update the mapping doc's example.

### WR-04: No `pipefail`, no unresolved-token check on the live cask render

**File:** `.github/workflows/channel-manifests.yml:201-206` (no `defaults.run.shell`)
**Issue:** `release-train.yml` sets `defaults: run: shell: bash` so steps run `bash -eo pipefail`. This file has no such default, so Linux
`run:` steps use `bash -e {0}`. In the tap render, `jq ... | jq -r ... > render.sed` ignores a failure of the first `jq`; an empty or partial
`render.sed` renders a cask with `@RELEASE_REPO@`-style tokens still in it. The only post-check is `grep -q "$KEY"`, which a half-rendered
file can still satisfy. The SUMMARY's "0 unresolved tokens" was observed in the dry run by hand and is not coded anywhere.
**Fix:** Add `defaults: { run: { shell: bash } }` at workflow level (the pwsh steps name their shell, so they are unaffected) and
`if grep -n '@[A-Z_0-9]*@' tap/Casks/powerbrowser.rb; then exit 1; fi` after rendering. Have the row require the default.

### WR-05: `winget install` of an unpinned `wingetcreate` in the job that submits with a PAT; winget may not exist on `windows-latest`

**File:** `.github/workflows/channel-manifests.yml:236-239`
**Issue:** `winget install --id Microsoft.WingetCreate` takes whatever version is current, and the resulting binary then runs with
`WINGET_TOKEN` in the next step. Nothing pins or verifies it, which is the same supply-chain gap the rest of the workflow closes with
SHA pins. The hosted Windows Server images do not reliably ship `winget`; Microsoft's documented CI path downloads
`https://aka.ms/wingetcreate/latest` as `wingetcreate.exe`. If `winget` is absent the leg fails at the first step.
**Fix:** Download a pinned release asset of `microsoft/winget-create` by version, check its SHA-256 against a value recorded in the
tree, then run it. Pass the token as `WINGET_CREATE_GITHUB_TOKEN` in the step env instead of `--token $env:WINGET_TOKEN` (line 258), so it
never appears on a command line. Add a row check for a version pin and that no `--token` flag carries a secret.

### WR-06: WINGET_TOKEN is a broad classic PAT held by the owner account, in the same environment as the MAR signing key and the R2 token

**File:** `.github/workflows/channel-manifests.yml:229`; `docs/RENEWALS.md:32`; `docs/winget-tap-checkpoint.md:42`; `docs/cache-flathub-checkpoint.md:61`
**Issue:** A classic PAT with `public_repo` grants write to every public repository the holding account can write to, not only the
winget-pkgs fork. The RENEWALS row calls it "fork-scoped", which a classic PAT cannot be. The holder is "the owner account". The `release`
environment already holds `MAR_SIGNING_P12_B64`, its password, and the R2 object-write token (checkpoint doc step 3 stores the cache
token there too). `winget-submit` is a hosted job running third-party tooling under that same environment, so a compromise of the leg's
tooling or of a later edit to the job reaches the signing material through `secrets.*` references. The row's allow-list of secret names
(`BOT_APP_PRIVATE_KEY`, `WINGET_TOKEN`) is the only barrier and it is a text check.
**Fix:** Create a dedicated `winget` environment (own reviewers, deployment branch rule `main`) holding only `WINGET_TOKEN`, and move the
job to it. Issue the PAT from a dedicated bot account whose only repository access is the winget-pkgs fork. Correct the RENEWALS wording
("classic PAT, account-wide public_repo"). The `channel-release-jobs` row's `environment !== 'release'` check must change to match.

### WR-07: The tracked `winget/` manifests are never submitted; `wingetcreate update` cannot create the first version

**File:** `.github/workflows/channel-manifests.yml:241-258`; `winget/*.yaml`; `scripts/verify-winget-manifest.mjs`
**Issue:** The leg runs `wingetcreate update DeBIOSFoundation.PowerBrowser --version ... --urls ... --out`, which starts from the manifest
already in `microsoft/winget-pkgs`, not from `winget/`. So (a) the first release cannot be submitted by this leg (`update` fails for an
unknown package; it needs `wingetcreate new` or a manual submission), and (b) the installer type (`nullsoft`), the `/S` switches,
`Scope: machine` and `MinimumOSVersion` in the tracked files are not what winget users get after the first version. The 8-case
`winget-manifest` self-test and its `--release` fixture refusal therefore guard files that do not reach winget. BLOCKED item 11 mentions
the first manual submit, but the workflow's header and `channel-train-mapping.md` present the tracked set as the payload.
**Fix:** Either make the leg start from the tracked set (`wingetcreate update --urls` is not that; copy `winget/*` with the version and the
computed hash substituted, then `wingetcreate submit`), or state in the header, the mapping doc and the row that the tracked files are the
owner's template for the first submission only, and add a check that the first-submit path has been recorded before `winget_asset` is
accepted.

### WR-08: The Nix repack declares the runtime libraries as `buildInputs` only; dlopen'd libraries (audio, GL, VA-API, notifications) are unreachable at run time

**File:** `nix/pkg/powerbrowser-bin.nix:101,115-116`
**Issue:** `autoPatchelfHook` rewrites the RPATH only for libraries a binary lists as `DT_NEEDED`. Gecko loads `libpulse`, `libasound`, `libva`,
`libEGL`/`libGL`/`libgbm`, `libnotify`, `libcups`, `libavcodec` and `libspeechd` with `dlopen`, so their store paths are not on any search path.
The nixpkgs `firefox-bin` handles this with `runtimeDependencies`/`appendRunpaths` and an `LD_LIBRARY_PATH` in the wrapper. This package
has neither: `makeWrapper ... --prefix PATH : ${lib.makeBinPath [ nodejs ]}` only. Expect no audio, no WebGL/hardware video and no
notifications on a non-FHS system, while `nix build` itself succeeds. BLOCKED item 2 defers the real build, so nothing has exercised this.
Separately, the SUMMARY/plan claim "the sidecar runs on the flake's nodejs_24" is not what happens: `TheiaService.sys.mjs:530-534` uses the
staged `node/bin/node` from the tarball first and only falls back to `PATH`; the Nix `nodejs` is a fallback, and `autoPatchelfHook` also has to
patch the bundled official Node ELF.
**Fix:** Add `runtimeDependencies = runtimeLibs;` (and `appendRunpaths`/`--prefix LD_LIBRARY_PATH : ${lib.makeLibraryPath runtimeLibs}` in the wrapper),
and add `stdenv.cc.cc.lib` to `buildInputs` for libstdc++. Make the first live step of 56-05 a launch smoke (audio, `about:support` GL), not only `nix build`.

### WR-09: `channel-release-jobs` cannot see the controls the review brief asks for, and its "no push to main" rule never matches the push the workflow actually makes

**File:** `scripts/verify-channel-release-jobs.mjs:228-231,274-282,162-298`
**Issue:**
- The push-to-main regex `git\s+(?:-c\s+\S+\s+)*push...` does not match `git -c "http.https://github.com/.extraheader=AUTHORIZATION: basic $AUTH" push origin "HEAD:refs/heads/main"`, because `-c\s+\S+\s+` cannot consume a quoted value containing a space. Tested: the exact push form used on lines 156 and 217 with `main` as the ref returns no match. The GH-05 rule is blind to the form this workflow uses, and the same regex guards the dry run (`git push`). The self-test plant uses a bare `git push origin HEAD:refs/heads/main`, the one form that does match, so the plant passes while the rule fails on real input.
- Not checked at all: job `permissions` (the "write trio" stated in the header), `environment: bot` on the flake and tap legs, the App token's `permission-*` and `repositories:` values, an event gate or dry-run gate, that `verify-flake-repack.mjs --release` runs in `flake-hash-pr`, that `tap-commit` runs the cask `--release`, `set -eu`/`pipefail`, and that `tarball_sha256` is compared.
- The 9 plants exercise 9 of roughly 25 rules. No plant for the SHA pin rule, the admission rule, the secret-name allow-list, the `needs: derive` rule, `environment`, `runs-on: windows-*`, the winget gate, or `checker-freshness`'s `--check-checker`. Removing `needs`, the `environment`, or the pin stays unproven.
- The "hash literal not derived from the published asset" plant only removes the `nix store prefetch-file` string, so a comment containing that string defeats it.
**Fix:** Parse the push with a tokenizer or match `\bpush\b` after stripping quoted strings; add plants for the exact quoted-header push to `main`, for an unpinned `uses:`, an unadmitted action, a removed `needs`, a changed `environment`, a widened `permission-*`, and a deleted `--release` step; assert those properties from the parsed YAML, not from substrings of `run:` text.

### WR-10: Flatpak sandbox grants X11 unconditionally and no row constrains `finish-args`

**File:** `flatpak/org.debios.PowerBrowser.json:7-15`; `scripts/verify-flathub-manifest.mjs:124-127`
**Issue:** `--socket=x11` together with `--socket=wayland` gives the app X11 access even on a Wayland session, which defeats Wayland isolation
(X11 clients can read other windows' input and screen). The least-privilege form is `--socket=fallback-x11` with `--socket=wayland`. `--share=network`
also exposes the sidecar's loopback listener to every host process and every network-sharing Flatpak, so the session token is the only barrier (it is,
but that should be stated). The row checks only that `--persist=.debios` is present, so adding `--filesystem=host` or `--talk-name=...` would stay green.
**Fix:** Use `--socket=fallback-x11`; keep `--share=network`/`--device=dri`/`--socket=pulseaudio`/`--share=ipc`. Add a row check that compares `finish-args` as set equality against a list in the row (the one place a hand-kept list is correct, because it is a policy allow-list), with a self-test plant for `--filesystem=host` and `--socket=x11`.

### WR-11: `policies-update-split` reads text and cannot see a merge that replaces or deletes siblings

**File:** `scripts/verify-policies-update-split.mjs:46-60,100-120`
**Issue:** The row extracts `.policies.<Key> = bool` and `["policies"]["<Key>"] = bool` assignments with regexes and compares only those. The "siblings stay byte-identical" claim is checked only for keys the merge assigns, which by construction is just `DisableAppUpdate`, so the sibling loop can only fire on a planted extra assignment. A merge such as `jq 'del(.policies.ExtensionSettings) | .policies.DisableAppUpdate = true'`, or the python line writing a different object, passes. Neither merge is executed, although `jq` and `python3` are present on every runner and the input is a tracked 7-line file. I executed the python line against the tracked file by reading it; it is correct today, but nothing in CI does.
**Fix:** In the row, run the real command text on a temp copy of `powerbrowser/distribution/policies.json` (extract the jq program from the `.nix` and the python command from the manifest), parse the output, and compare it to `{...tarball, policies: {...tarball.policies, DisableAppUpdate: true}}` by deep equality. Keep the text match only as the locator.

## Info

### IN-01: `flake-hash-pr` is not idempotent

**File:** `.github/workflows/channel-manifests.yml:151-160`
**Issue:** A re-run for the same key fails at `git push` (the branch exists, not a fast-forward) or at `git commit` (record unchanged). A failed run therefore cannot be re-dispatched, which release.yml explicitly keeps possible.
**Fix:** `git diff --cached --quiet && { echo "already current"; exit 0; }`, and look for an open PR (`gh pr list --head "$BRANCH"`) before `gh pr create`; push with `--force-with-lease` to a bot-owned branch name.

### IN-02: Overlay binds the flake's own `nodejs_24`, not the consumer's

**File:** `flake.nix:149-160`
**Issue:** `overlays.default` calls the derivation with `inherit nodejs;` from the flake's nixpkgs, so a consumer with a different nixpkgs mixes two glibc closures for the PATH fallback. It also embeds the flake's `system` implicitly.
**Fix:** `{ nodejs = final.nodejs_24; }` in the overlay, leaving the flake's own binding for `packages`.

### IN-03: nixConfig deferral is correct; the consumer step is missing from the copy

**File:** `flake.nix` (no `nixConfig`); `docs/download-nix.md`; `nix/cache.json`
**Issue:** Deferring `nixConfig` is right: a placeholder in `extra-trusted-public-keys` makes every consumer's Nix reject the configuration, and a flake `nixConfig` only applies after the user accepts it (`--accept-flake-config` or `accept-flake-config = true`). The download copy gives the plain `nix profile add` line only, so without that step nobody substitutes from the cache and everyone compiles nothing but still downloads the tarball (no cache needed in practice, since the package builds nothing). Low impact: the cache serves the closure of the runtime libraries only.
**Fix:** When the keys exist, add `nixConfig` and a sentence for `--accept-flake-config`; keep the `--release` placeholder refusal in `binary-cache`.

### IN-04: Cask `uninstall delete:` duplicates the `app` stanza; zap path and bundle layout are unverified

**File:** `homebrew-tap/Casks/powerbrowser.rb:24-26`
**Issue:** `app "PowerBrowser.app"` already removes the app on uninstall; the explicit `delete: "/Applications/PowerBrowser.app"` is redundant and would also remove a manually installed copy at that path. `zap trash: "~/Library/Application Support/PowerBrowser"` removes only the app's own profile directory, opt-in via `--zap`, which is acceptable; it omits caches and preferences, so zap is incomplete rather than overreaching. BLOCKED item 12 records the paths as unconfirmed.
**Fix:** Drop the `uninstall delete:` line; extend `zap` to the confirmed `~/Library/Caches/...` and `~/Library/Preferences/...` paths after Phase 55 evidence.

### IN-05: Flathub verification mechanism and the shipped `.desktop` header

**File:** `flatpak/org.debios.PowerBrowser.json:56-61`; `flatpak/org.debios.PowerBrowser.desktop:1-5`
**Issue:** The manifest models Flathub app verification as a DNS TXT record on `_flathub.powerbrowser.org`, derived from the homepage host. To my knowledge Flathub verifies a reverse-DNS app id through a token file at `https://<domain>/.well-known/org.flathub.VerifiedApps.txt`, and the domain is the one in the app id (`org.debios.*` gives `debios.org`), not the homepage host. I could not check Flathub offline, so treat this as unconfirmed; the `x-flathub-verification` key is also not a flatpak-builder key. The copied `.desktop` still carries the checkout-root instruction ("replace @POWERBROWSER_REPO_ROOT@ ...") from the tracked source, which would ship in the Flatpak.
**Fix:** Confirm the verification method and domain against Flathub's current documentation before owner step 9, and strip the comment header when generating the Flatpak desktop copy.

---

_Reviewed: 2026-10-31_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: deep_
