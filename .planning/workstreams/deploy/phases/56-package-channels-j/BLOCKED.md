# Phase 56 BLOCKED items (owner and live-account steps)

Executed by the autonomous run of plans 56-01 to 56-04. Nothing below was run: no push, no pull request,
no account change, no store submission, no cache push, no secret was created or read. Each item names what
is blocked, the owner command or click, and what the tree already holds. Plan 56-05 (the owner checkpoint)
is not executed by this run and is listed at the end.

## 1. Release hash record (blocks the flake package and the Flatpak submission)

- **Blocked:** `nix/pkg/release-hash.json` holds the sentinel `PLACEHOLDER-DIST12-BOT-PR-FILLME` for
  `v153.5.1-1`. No Release is published, so no real digest exists.
- **Owner step:** after the first Release for the key is published with its tarball attached, run the
  DIST-12 bot PR (`channel-manifests.yml`, job `flake-hash-pr`), or by hand:
  `nix store prefetch-file --hash-type sha256 --json https://github.com/<repo>/releases/download/<key>/<tarball>`,
  write its `hash` into `sha256` in `nix/pkg/release-hash.json` with `releaseKey` set to the key, then run
  `node scripts/verify-flake-repack.mjs --release`. The row refuses the sentinel until this is done.
- **Tree state:** the derivation, the Flatpak tokens and the download copy all read this one record.

## 2. Clean-machine substitute proof and the deferred nixConfig wiring (INF-05)

- **Blocked:** `nix build .#powerbrowser` has not run against a real tarball (it needs item 1), and
  `flake.nix` carries no `nixConfig` for the substituters yet. A placeholder trusted key there would make every
  consumer's nix reject the config.
- **Owner step:** after items 1, 6 and 7 create the real public keys, add `nixConfig` from `nix/cache.json`
  `interface` (extra-substituters and extra-trusted-public-keys) in the same commit as the values. Then run
  `nix build .#powerbrowser` on a clean machine with the live cache and paste the substitute log into the
  56-05 evidence.

## 3. Flatpak runtime, base and checker schema (owner-verify)

- **Changed by the review fix CR-04:** the manifest no longer names the BaseApp as the runtime. It now pairs
  `org.freedesktop.Platform` / `org.freedesktop.Sdk` at `26.08` with `base: org.mozilla.firefox.BaseApp` at
  `base-version: 26.08`. Sources read on 2026-10-31 (read-only): the `flathub/org.mozilla.firefox.BaseApp`
  repository has a `branch/26.08` whose manifest declares `runtime: org.freedesktop.Platform`,
  `runtime-version: 26.08`, `sdk: org.freedesktop.Sdk`, and `https://dl.flathub.org/repo/refs/heads/runtime/org.freedesktop.Platform/x86_64/26.08`
  and `.../app/org.mozilla.firefox.BaseApp/x86_64/26.08` both answer 200. The Firefox application manifest itself was not
  readable, so the pairing is derived from the BaseApp manifest and the published refs, not from a Firefox build.
- **Still owner-verify:** the external-data-checker `json` type with `url-template`, and the `base` key behaviour of the
  pinned flatpak-builder (a `--show-manifest` and a local `--force-clean` build). Run both before the Flathub
  submission, not after (item 8 gives the render command).

## 4. Nix /download copy (site outside this tree, Phase 47)

- **Blocked:** `docs/download-nix.md` and `docs/download-flatpak.md` carry `@RELEASE_REPO@`, which the owner renders
  with the release home before pasting into the Phase 47 site.
- **Owner step:** render `@RELEASE_REPO@` as `<owner>/<repo>` from `configuration.toml` `[urls] release_notes`,
  then paste the rendered copy. The rendered text is not committed.

## 5. Ruby syntax check (closed)

- **Closed:** `ruby -c homebrew-tap/Casks/powerbrowser.rb` prints `Syntax OK` through the locked nixpkgs:
  `nix --extra-experimental-features 'nix-command flakes' shell --inputs-from . nixpkgs#ruby --command ruby -c homebrew-tap/Casks/powerbrowser.rb`.
  This reads from the binary cache and writes nothing. No owner step remains for this item.

## 6. Cachix cache and licence reply (INF-05, owner account)

- **Blocked:** the `powerbrowser` Cachix cache does not exist, and Cachix's free open-source plan has no published
  licence allow-list for PolyForm Noncommercial, so the eligibility is unknown.
- **Owner steps:** send the licence request in `docs/cache-flathub-checkpoint.md` (owner-steps section, "Cachix licence
  request"), record the reply verbatim there with the date, then create the cache, write its public key into
  `nix/cache.json` `cachix.publicKey` and `interface.trustedKeys`, and run `node scripts/verify-binary-cache.mjs --release`.
- **Tree state:** the substituter and the placeholder key are in `nix/cache.json`; the RENEWALS cache-token row exists.

## 7. R2 fallback bucket, key pair and token (INF-05, Cloudflare account)

- **Blocked:** the R2 bucket `powerbrowser-nix-cache`, its public read host and its signing key pair do not exist.
  R2 may need a payment method on file.
- **Owner steps:** follow "R2 fallback enablement" in `docs/cache-flathub-checkpoint.md`. Generate the key pair with
  `nix-store --generate-binary-cache-key` outside the tree, write only the public key and the host into
  `nix/cache.json`, create the object-write token in the release environment, then run the binary-cache row with `--release`.

## 8. Flathub exception request, render and submission (PKG-20, owner identity)

- **Blocked:** the written prebuilt-tarball linter exception and the submission pull request must come from the
  owner's Flathub account. The manifest stays on `pending-owner-reply` until the written reply is recorded.
- **Owner steps:** send the exception request in `docs/cache-flathub-checkpoint.md` and record the reply. Once item 1
  holds the real digest, render the manifest with
  `node scripts/verify-flathub-manifest.mjs --render <scratch-dir>/org.debios.PowerBrowser.json` (a scratch directory
  outside the checkout), run item 3, and open the submission under the owner's identity. If the exception is refused,
  the named follow-up is a from-source manifest, which this phase does not build.

## 9. Flathub domain verification (PKG-20, DNS or web server for debios.org)

- **Changed by the review fix IN-05:** Flathub verifies the domain of the app ID, which for `org.debios.PowerBrowser`
  is `debios.org`, not the homepage host `powerbrowser.org` (docs.flathub.org "Verification", read 2026-10-31). The two
  methods are a TXT record `_flathub.debios.org` or the file `https://debios.org/.well-known/org.flathub.VerifiedApps.txt`.
  The token appears in the Flathub Developer Portal after the submission is accepted. The manifest's `x-flathub-verification`
  key is a tracked note, not a flatpak-builder key.
- **Blocked:** the record or file does not exist, and whether the foundation controls `debios.org` is not established
  in this tree (owner-verify; if it does not, the app ID has to change before the submission).
- **Owner steps:** after the Developer Portal shows the value, create the TXT record `_flathub.debios.org` with it (or serve
  the well-known file), write the value into `x-flathub-verification.token` in the manifest, and run
  `node scripts/verify-flathub-manifest.mjs --release`.

## 10. Homebrew tap repository and the cask audit (DIST-11, Phase 41)

- **Blocked:** the tap repository `homebrew-powerbrowser` does not exist, and the bot App is not installed on it (Phase 41).
- **Owner steps:** create the tap repository, install the bot App with contents write on it, then run
  `brew audit --new --cask` on the rendered cask once the tap exists (render with the dry run in
  `docs/winget-tap-checkpoint.md`). The cask makes no notarization claim; its deferral marker stays until item 12.

## 11. Windows asset, winget install and the winget submission (DIST-04, Phase 54 and the owner)

- **Blocked:** no Windows asset is named in `docs/RELEASING.md` (assumption A2), so the winget set carries the fixture.
  The silent switch `/S` and `InstallerType: nullsoft` are not run against an installer. The WINGET_TOKEN classic PAT
  (public_repo) is not created, and the `winget` environment does not exist or hold it yet.
- **Owner steps:** name the Phase 54 asset in the asset table, then run a `wingetcreate update ... --out` dry run and a
  Windows silent install, and correct the three files if the switch or the type differs. Create the classic PAT, store it as
  the environment secret `WINGET_TOKEN` in the `winget` environment (not `release`, which holds the MAR signing key),
  record its holder (already in `docs/RENEWALS.md`), then submit the winget set (`docs/winget-tap-checkpoint.md`) and
  record the pull request link there.
- **Token scope (review fix WR-06):** wingetcreate does not support fine-grained personal access tokens (its
  `doc/token.md`, read 2026-10-31, says "Fine-grained tokens are not supported", microsoft/winget-create issue 595), so
  `public_repo` on a classic PAT is the minimum. Use a dedicated bot account whose only write access is its winget-pkgs
  fork, so the account, not the token, bounds the reach. The token reaches wingetcreate through the
  `WINGET_CREATE_GITHUB_TOKEN` environment variable, never `--token`. Owner-verify that the variable name still holds in the
  pinned wingetcreate 1.12.13.0.
- **First submission (review fix WR-07):** the first version is submitted from the tracked `winget/` set (rendered, then
  `wingetcreate submit`); `wingetcreate update` runs only when `manifests/d/DeBIOSFoundation/PowerBrowser` already exists in
  microsoft/winget-pkgs. Owner-verify that `submit` accepts the rendered directory and that the manifest validates.

## 12. Cask shape decisions and the darwin enablement (DIST-11, Phase 55 and A3)

- **Blocked:** the cask's `depends_on macos: ">= :big_sur"` minimum and the `zap trash:` path (the redundant `uninstall delete:` line was dropped by the review fix IN-04; `zap` still omits caches and preferences until the bundle paths are confirmed)
  are not confirmed against the notarized app; the macOS asset name is the fixture (A3). The darwin deferral marker stays
  until Phase 55 evidence exists.
- **Owner steps:** confirm the minimum macOS version and the application's bundle paths in Phase 55; name the Phase 55
  disk image in the asset table; after the notarized evidence exists, remove the deferral marker and add the arm64
  stanza in the same commit, then run `node scripts/verify-homebrew-cask.mjs --release`.

## 13. Environments, secrets and the tap App (DIST-12, repository owner)

- **Blocked:** the channel legs need the `bot` environment (`BOT_APP_PRIVATE_KEY` secret, `BOT_APP_ID` variable, the App
  with contents and pull-requests write and no Workflows permission) and the `winget` environment with `WINGET_TOKEN`
  (declared in `.github/settings/environment-winget.json` with the owner as required reviewer and admin bypass off, as `release`; each winget-submit run therefore waits for an owner approval; run `node scripts/apply-repo-controls.mjs` to create it).
  The tap repository needs the bot App installed on it.
- **Owner steps:** confirm the bot environment already holds the App key (Phase 43), add `WINGET_TOKEN` to the `winget`
  environment (item 11), and confirm the App installation covers `homebrew-powerbrowser`.

## 14. Train wiring: assumption A6 (DIST-12, Phases 43 and 49)

- **Blocked:** `channel-manifests.yml` is a reusable workflow with the inputs `release_key`, `live`, `dry_run`,
  `tarball_sha256`, `dmg_asset`, `dmg_sha256`, `winget_asset` and `winget_sha256` (review fixes CR-01 and CR-02: live or dry is an
  input, never `github.event_name`). The train does not yet call it, and the call must pass `live: true` and `dry_run`.
- **Owner or next-plan step:** the train's stage table calls `uses: ./.github/workflows/channel-manifests.yml` with those
  inputs after a publish. If the Phase 49 table differs in shape, remap the inputs (`docs/channel-train-mapping.md`), keep
  the leg semantics, and record the delta against A6 in the Phase 56 SUMMARY.

## 15. Live dry run and the first live legs (plan 56-05, owner checkpoint)

- **Blocked:** no channel leg has run live. The dry run needs a published key: start `channel-manifests.yml` with
  `workflow_dispatch` and the key, then paste the rendered payload list.
- **Owner steps:** after items 1, 9, 10, 11 and 13, the train calls the stage. Paste the pull request URL (flake leg), the tap
  commit URL, the winget pull request URL and the checker result into the 56-05 evidence.

## 16. Plan 56-05: the owner checkpoint (not executed by this run)

- **Not executed:** plan 56-05 is the owner checkpoint. It lists every live action above in order and collects the pasted
  evidence. This run stopped after plan 56-04 by instruction.
