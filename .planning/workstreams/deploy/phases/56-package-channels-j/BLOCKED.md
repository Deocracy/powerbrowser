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
