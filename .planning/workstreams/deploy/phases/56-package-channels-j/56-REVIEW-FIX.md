---
phase: 56-package-channels-j
fixed_at: 2026-10-31
review_path: .planning/workstreams/deploy/phases/56-package-channels-j/56-REVIEW.md
iteration: 1
findings_in_scope: 20
fixed: 20
skipped: 0
status: all_fixed
---

# Phase 56: Code Review Fix Report

**Source review:** 56-REVIEW.md (4 critical, 11 warning, 5 info). All 20 are fixed. Branch `dsh/phase-56`,
first merged with `origin/workspace/deploy` (merge commit 972b735a; no conflicts; `generate.mjs` wrote no change; the
`upstream/` tree needed patch 040's three NSIS files re-applied with `git apply --3way`, nothing under `upstream/` committed).

## Findings

- CR-01 FIXED 596f8bcd. Live legs gate on `inputs.live && !inputs.dry_run`, the dry run on `!inputs.live || inputs.dry_run`; no `github.event_name`. The `workflows` row has a new rule `call-event-gate` (job and step plants). Mapping doc shows `live: true` and `dry_run`.
- CR-02 FIXED 69830a2c. New `verify-assets` job recomputes each digest from the downloaded asset, requires it to equal the SHA256SUMS line and the caller value, and verifies the attestation. The cask is rendered by `--render-live tap` (literal replacement, leftover-token check), and `verify-homebrew-cask.mjs --release --rendered` runs before the push. Asset names come from the derivation (tarball) or its grammar plus SHA256SUMS (dmg, exe), never fixtures. **Decision: the tap leg stays a direct push.** Plan 56-04 and `docs/winget-tap-checkpoint.md` mandate "a direct push to the tap, never a PR"; the push is now gated on the recomputed, attested digest and the `--release --rendered` check.
- CR-03 FIXED 9a6de1de. `"strip-components": 0`. Proven by `scripts/lib/channel-exec.mjs`, which packs a fixture tarball with the derivation's layout, unpacks it with the source's own strip count and runs the real `build-commands` under bash; plants for the default, a wrong count and a wrong copy source (the old manifest reproduces the reviewer's `NotADirectoryError`).
- CR-04 FIXED c03a2934. `org.freedesktop.Platform`/`Sdk` 26.08 with `base: org.mozilla.firefox.BaseApp`, `base-version: 26.08`. Checked read-only against `flathub/org.mozilla.firefox.BaseApp` `branch/26.08` and the `dl.flathub.org` refs (both 200). The row requires these values and the old value is now a plant. BLOCKED item 3 marks the `--show-manifest` and a local build owner-verify.
- WR-01 FIXED 69830a2c. Inputs validated once in `derive` (`--check-inputs`), asset names against a plain-name grammar, digests `^[0-9a-f]{64}$`; the sed program is gone.
- WR-02 FIXED 69830a2c. `tarball_sha256` is required when live, compared with SHA256SUMS and the attested asset (`gh attestation verify` pinned to `release.yml`, `refs/heads/main`, `--deny-self-hosted-runners`, on a hosted runner); the optional guard is a row failure.
- WR-03 FIXED 596f8bcd. `dry_run` input, `concurrency: channel-manifests-<key>` (cancel-in-progress false), mapping doc updated.
- WR-04 FIXED 69830a2c (shell default in 596f8bcd). `defaults.run.shell: bash`; node renderer with leftover-token check; rows require both.
- WR-05 FIXED 491c623d. wingetcreate 1.12.13.0 downloaded by exact URL, SHA-256 `24042bd3...ffea` checked (recomputed from the downloaded file and equal to the GitHub release digest) in a step without the token; token passed as `WINGET_CREATE_GITHUB_TOKEN` in the submit step only; `--token` is a row failure.
- WR-06 FIXED 491c623d and 380c4fe7. `WINGET_TOKEN` moved to a new `winget` environment (`environment-winget.json`, repo-controls table, RELEASING table and list). wingetcreate supports classic PATs only (its `doc/token.md`: "Fine-grained tokens are not supported"), so BLOCKED and RENEWALS say a dedicated bot account bounds the scope. Coordinator follow-up 380c4fe7: the winget environment copies `release`'s required reviewer, self-review, wait timer, admin-bypass-off and main-only policy; repo-controls now requires a reviewer and `can_admins_bypass: false` on `release` and on every environment whose job reads `WINGET_TOKEN` (derived from the workflow), with plants. The `bot` environment (App key, automation by design, Phase 43) is deliberately outside that rule.
- WR-07 FIXED 491c623d. First version submits the tracked `winget/` set rendered with the verified digest (`--render-live winget`, `verify-winget-manifest.mjs --release --rendered`); `wingetcreate update` only when the package exists in winget-pkgs, with its digest checked.
- WR-08 FIXED 7ce2bc21. Wrapper `--prefix LD_LIBRARY_PATH` from the locked nixpkgs firefox wrapper's `libs` (cited by rev; `ffmpeg_8` because Firefox 146 and later use it), `stdenv.cc.cc.lib` added. Node: the tarball's staged `node/bin/node` is the sidecar runtime; the flake's Node is the documented PATH fallback only. Checked with `nix eval` of the drvPath and of `installPhase`. Not built (BLOCKED item 2).
- WR-09 FIXED f5c36d76. The row parses the workflow as YAML (`scripts/lib/channel-workflow-rules.mjs`); 72 structural plants including the quoted extraheader push to main.
- WR-10 FIXED e82173dc. `--socket=fallback-x11`; `finish-args` compared with the allow-list as a set; plants for plain x11, a host filesystem grant and a bus-name grant. Loopback exposure stated in `docs/cache-flathub-checkpoint.md`.
- WR-11 FIXED 4cf3ddfd. The jq program and the Flatpak build-commands are executed and compared with deep equality; plants delete or rewrite a sibling.
- IN-01 FIXED 444b26a9. Exits when the record is current, `--force-with-lease` against the remote value, `gh pr list` before `gh pr create`.
- IN-02 FIXED 7ce2bc21 (committed with WR-08 by mistake; the overlay binds `final.nodejs_24`, checked with `nix eval --apply`). Row requires it, with a plant.
- IN-03 FIXED 60aaab70. The download copy carries the `--accept-flake-config` sentence; the row requires it.
- IN-04 FIXED 4a37fe36. The `uninstall delete:` line is dropped; the cask row refuses it (and no longer requires an uninstall stanza).
- IN-05 FIXED 01b80897. Flathub verifies the domain of the app ID (`debios.org`): TXT `_flathub.debios.org` or `/.well-known/org.flathub.VerifiedApps.txt`, token from the Developer Portal (docs.flathub.org, read 2026-10-31). Row, manifest, docs and BLOCKED item 9 corrected; domain control of `debios.org` is marked owner-verify. The checkout-root comment is stripped from the Flatpak desktop copy and the Nix desktop entry.

## Verification

Run in the isolated clone `dsh/phase-56` (a git checkout, not a Nix worktree; `jq`, `python3`, `tar`, `bash` on PATH). `generate.mjs --check` PASS (69 files); `nix flake check --no-build --no-write-lock-file` passes; drvPath evaluates; `flake.lock` unchanged; every touched script's `--self-test` PASS; the 14 Phase 56 rows, `workflows`, `workflows-self-test` and `zizmor` PASS; full `scripts/verify-platform.sh --quick` exits 0.

## Not done

Nothing was built or run live: no Flatpak build, no `nix build`, no wingetcreate run, no workflow run. The `gh attestation verify` flags, the `WINGET_CREATE_GITHUB_TOKEN` name for the pinned version and `wingetcreate submit` on a directory are owner-verify at plan 56-05.

---

_Fixed: 2026-10-31_
_Fixer: Claude (gsd-code-fixer)_
_Iteration: 1_
