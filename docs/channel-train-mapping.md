# Channel stage: train interface and input mapping

The channel-manifests stage (`.github/workflows/channel-manifests.yml`) plugs behind the release train's
stage interface. The train owns the release (Phases 43 and 49); this stage owns the four channel legs.

## The call contract

The train calls the stage as a reusable workflow once a release is published:

    jobs:
      channel:
        if: ${{ needs.publish.result == 'success' }}
        uses: ./.github/workflows/channel-manifests.yml
        with:
          release_key: <v<ESR>-<revision> the train published>
          live: true
          dry_run: ${{ inputs.dry-run }}
          tarball_sha256: <SHA-256 of the published Linux tarball, from the Release SHA256SUMS>
          dmg_asset: <macOS disk image asset name; empty until Phase 55 (A3)>
          dmg_sha256: <SHA-256 of that disk image; required with dmg_asset>
          winget_asset: <Windows installer asset name; empty until Phase 54 (A2)>
          winget_sha256: <SHA-256 of that installer; required with winget_asset>

The live legs run only when `live` is true and `dry_run` is false. The stage never reads `github.event_name`:
inside a called workflow the `github` context is the caller's, so an event gate is wrong there (the
`workflows` row refuses it). The train passes `dry_run: ${{ inputs.dry-run }}` so a train dry run renders the
payloads and writes nothing. The stage holds `concurrency: channel-manifests-<release_key>`, so two calls for one
key never race on `chore/channel-<key>` or on the tap.

No secrets are passed in. Each leg names its GitHub environment (`bot` for the flake and tap legs, `winget`
for the winget leg, which holds `WINGET_TOKEN` alone), and the environment holds the secret, which the leg reads by name.

## Input table

| Input | Consumed by | What the leg does with it |
| --- | --- | --- |
| `live` | every live job's `if` | True only for a published release. False (the default) runs the `dry-run` job alone. |
| `dry_run` | every job's `if` | True forces the dry run even when `live` is true. |
| `release_key` | derive, every live leg | The derive job checks it against the key the tree derives (`--check-key`); every leg derives its payload from it. |
| `tarball_sha256` | derive, verify-assets, flake-hash-pr | Required when `live`. A cross-check only: verify-assets recomputes the digest from the downloaded asset, compares it with the Release's SHA256SUMS and with this value, and verifies the attestation. A difference fails the stage. |
| `dmg_asset`, `dmg_sha256` | tap-commit (and its gate) | The disk image name (checked against the tree's naming grammar and SHA256SUMS) and its digest, cross-checked the same way. An empty `dmg_asset` skips the tap leg, so no cask names an unpublished disk image. |
| `winget_asset`, `winget_sha256` | winget-submit (and its gate) | The Windows installer name and digest, handled the same way. An empty `winget_asset` skips the winget leg (A2). |

Every digest is 64 lowercase hex characters (`^[0-9a-f]{64}$`), validated once in the derive job; a caller value
is never placed in a sed or shell program, only in an environment variable. The attestation check is
`gh attestation verify` pinned to `release.yml` on `refs/heads/main` on a GitHub-hosted runner, as Phase 50 does.

## The four legs

| Leg | Output | Live effect |
| --- | --- | --- |
| flake-hash-pr | `nix/pkg/release-hash.json` | A pull request to main on `chore/channel-<key>`. Never a push to main (GH-05). |
| tap-commit | `Casks/powerbrowser.rb` in the tap repository | A direct push to the tap's default branch with the bot App token, only after `verify-homebrew-cask.mjs --release --rendered` passes on the rendered file. The plan mandates the direct push for the own tap; the release check, not a reviewer, is the gate. |
| winget-submit | the tracked `winget/` set rendered with the verified installer digest (first version), or the `wingetcreate update --out` set (later versions), then submitted | A winget pull request from the bot account's fork, with WINGET_TOKEN from the winget environment, read in the submit step only. wingetcreate is pinned by version and SHA-256. |
| checker-freshness | none | Checks that the Flatpak `x-checker-data` template resolves to the tarball URL. No network. |

## Dry run

A direct `workflow_dispatch`, or a call with `live: false` or `dry_run: true`, runs the `dry-run` job alone. It renders the payloads into the runner's temporary
directory (`node scripts/verify-channel-release-jobs.mjs --render <dir> --key <key>`) and lists them:
the flake-hash plan, the tap cask, the three winget manifests and the checker URL. It pushes nothing, opens
nothing, submits nothing and holds no secret.

## Assumption A6: the Phase 49 stage table

The train table is owned by Phases 43 and 49. This stage assumes the table calls a reusable workflow with the
four inputs above. If the Phase 49 table differs in shape, the input mapping follows it, and the leg
semantics stay as written: a pull request for the flake hash, a direct tap push, a gated winget submission, and
a static checker check. The Phase 56 SUMMARY records the delta against A6 when the table is wired.
