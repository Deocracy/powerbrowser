# Channel stage: train interface and input mapping

The channel-manifests stage (`.github/workflows/channel-manifests.yml`) plugs behind the release train's
stage interface. The train owns the release (Phases 43 and 49); this stage owns the four channel legs.

## The call contract

The train calls the stage as a reusable workflow once a release is published:

    jobs:
      channel:
        uses: ./.github/workflows/channel-manifests.yml
        with:
          release_key: <v<ESR>-<revision> the train published>
          tarball_sha256: <SHA-256 of the published Linux tarball, from the release>
          dmg_sha256: <SHA-256 of the published macOS disk image; empty until Phase 55 (A3)>
          winget_asset: <Windows installer asset name; empty until Phase 54 (A2)>

No secrets are passed in. Each leg names its GitHub environment (`bot` for the flake and tap legs, `release`
for the winget leg), and the environment holds the secret, which the leg reads by name.

## Input table

| Input | Consumed by | What the leg does with it |
| --- | --- | --- |
| `release_key` | derive, every live leg | The derive job checks it against the key the tree derives (`--check-key`); every leg derives its payload from it. |
| `tarball_sha256` | flake-hash-pr | Cross-checks the hash the flake leg prefetches from the published asset; a difference fails the leg. |
| `dmg_sha256` | tap-commit (and its gate) | The cask's sha256. An empty value skips the tap leg, so no cask names an unpublished disk image. |
| `winget_asset` | winget-submit (and its gate) | The Windows installer URL under the release key. An empty value skips the winget leg (A2). |

## The four legs

| Leg | Output | Live effect |
| --- | --- | --- |
| flake-hash-pr | `nix/pkg/release-hash.json` | A pull request to main on `chore/channel-<key>`. Never a push to main (GH-05). |
| tap-commit | `Casks/powerbrowser.rb` in the tap repository | A direct push to the tap's default branch with the bot App token. |
| winget-submit | the winget set, written with `wingetcreate update --out`, then submitted | A winget pull request under the owner's fork, with WINGET_TOKEN from the release environment. |
| checker-freshness | none | Checks that the Flatpak `x-checker-data` template resolves to the tarball URL. No network. |

## Dry run

`workflow_dispatch` runs the `dry-run` job alone. It renders the payloads into the runner's temporary
directory (`node scripts/verify-channel-release-jobs.mjs --render <dir> --key <key>`) and lists them:
the flake-hash plan, the tap cask, the three winget manifests and the checker URL. It pushes nothing, opens
nothing, submits nothing and holds no secret.

## Assumption A6: the Phase 49 stage table

The train table is owned by Phases 43 and 49. This stage assumes the table calls a reusable workflow with the
four inputs above. If the Phase 49 table differs in shape, the input mapping follows it, and the leg
semantics stay as written: a pull request for the flake hash, a direct tap push, a gated winget submission, and
a static checker check. The Phase 56 SUMMARY records the delta against A6 when the table is wired.
