# Phase 56 BLOCKED items (owner and live-account steps)

Executed by the autonomous run of plans 56-01 to 56-04. Nothing below was run: no push, no PR,
no account change, no store submission, no cache push, no secret was created or read. Each
item names what is blocked, the owner command or click, and what the tree already holds.
Plan 56-05 (the owner checkpoint) is not executed by this run.

## 1. Release hash record (blocks the flake package and the Flatpak submission)

- **Blocked:** `nix/pkg/release-hash.json` holds the sentinel `PLACEHOLDER-DIST12-BOT-PR-FILLME`
  for `v153.5.1-1`. No release has been published, so no real digest exists.
- **Owner step:** after the first Release for the key is published and its tarball is attached,
  run the DIST-12 bot PR (`channel-manifests.yml`, job `flake-hash-pr`) or, by hand:
  `nix store prefetch-file --hash-type sha256 --json https://github.com/<repo>/releases/download/<key>/<tarball>`
  then write the `hash` value into `sha256` in `nix/pkg/release-hash.json`, and run
  `node scripts/verify-flake-repack.mjs --release`. The row refuses the sentinel until this is done.
- **Tree state:** the derivation, the Flatpak tokens and the download copy all read this one record.

## 2. Flake build and cache substitution (blocks the clean-machine proof, INF-05)

- **Blocked:** `nix build .#powerbrowser` has not run against a real tarball. It needs item 1.
- **Owner step:** after item 1, run `nix build .#powerbrowser` on a clean machine with the live
  cache, paste the substitute log into the 56-05 evidence.
- **Deferred wiring:** `flake.nix` carries no `nixConfig` for the substituters yet. A placeholder
  trusted key there would make every consumer's nix reject the config. After items 6 and 7 create the
  real public keys, add `nixConfig` from `nix/cache.json` `interface` (extra-substituters and
  extra-trusted-public-keys) in the same commit as the values.

## 3. Flatpak runtime and checker schema (offline-unverified)

- **Blocked:** the `org.mozilla.firefox.BaseApp` runtime-version `stable` pairing with
  `org.freedesktop.Sdk`, and the external-data-checker `json` type with `url-template`, cannot
  be verified without network reads of Flathub.
- **Owner step:** run `flatpak-builder --show-manifest` on a rendered copy of
  `flatpak/org.debios.PowerBrowser.json` (tokens rendered), and an external-data-checker dry run,
  before the Flathub submission.

## 4. Nix /download copy (site outside this tree, Phase 47)

- **Blocked:** `docs/download-nix.md` carries `@RELEASE_REPO@`, which the owner renders with the
  release home before pasting into the Phase 47 site.
- **Owner step:** render `@RELEASE_REPO@` as `<owner>/<repo>` from `configuration.toml`
  `[urls] release_notes`, then paste the rendered copy. The rendered text is not committed.

## 5. Ruby syntax check for the cask (plan 56-03)

- **Blocked:** `ruby -c homebrew-tap/Casks/powerbrowser.rb` cannot run on this host (no ruby).
- **Owner step:** run `ruby -c homebrew-tap/Casks/powerbrowser.rb` (or `brew audit --new --cask`
  once the tap exists) before the tap commit.

## 6. Cachix cache and licence reply (INF-05, owner account)

- **Blocked:** the `powerbrowser` Cachix cache does not exist, and Cachix's free open-source plan
  has no published licence allow-list for PolyForm Noncommercial. The eligibility is unknown.
- **Owner steps:** send the licence request text in `docs/cache-flathub-checkpoint.md` (owner-steps
  section, "Cachix licence request"), record the reply verbatim in that file with the date, then
  create the cache, copy its public key into `nix/cache.json` `cachix.publicKey` and
  `interface.trustedKeys`, and run `node scripts/verify-binary-cache.mjs --release`.
- **Tree state:** the substituter and the placeholder key are in `nix/cache.json`; the RENEWALS
  cache-token row exists.

## 7. R2 fallback bucket, key pair and token (INF-05, Cloudflare account)

- **Blocked:** the R2 bucket `powerbrowser-nix-cache`, its public read host and its signing key
  pair do not exist. R2 may need a payment method on file.
- **Owner steps:** follow "R2 fallback enablement" in `docs/cache-flathub-checkpoint.md`. Generate the key
  pair with `nix-store --generate-binary-cache-key` outside the tree, write only the public key and the host
  into `nix/cache.json`, create the object-write token in the release environment, then run the
  binary-cache row with `--release`.

## 8. Flathub exception request and submission (PKG-20, owner identity)

- **Blocked:** the written build-from-source exception (a prebuilt-tarball linter exception) and the
  submission pull request must come from the owner's Flathub account. The manifest stays on
  `pending-owner-reply` until the written reply is recorded.
- **Owner steps:** send the exception request in `docs/cache-flathub-checkpoint.md`, record the
  reply, and only then render the manifest with
  `node scripts/verify-flathub-manifest.mjs --render <scratch-dir>/org.debios.PowerBrowser.json` (after
  item 1) and open the submission under the owner's identity. If the exception is refused, the named
  follow-up is a from-source manifest, which this phase does not build.
- **Ruby, flatpak-builder, external-data-checker:** run `flatpak-builder --show-manifest` on the rendered
  copy and an external-data-checker dry run before the submission (BLOCKED.md item 3).

## 9. DNS TXT verification value (PKG-20, Cloudflare DNS for powerbrowser.org)

- **Blocked:** the `_flathub.powerbrowser.org` TXT record does not exist. Flathub shows the value only
  in its verification step.
- **Owner steps:** after the Flathub verification step shows the value, create the TXT record
  `_flathub.powerbrowser.org` with that value in the DNS zone (Phase 47 owner step), write the value into
  `x-flathub-verification.token` in the manifest, and run `node scripts/verify-flathub-manifest.mjs --release`.

