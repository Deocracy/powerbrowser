# winget and Homebrew tap checkpoint

Tracked commands for the owner. Nothing in this file runs in the tree. The dry runs write only to a
scratch directory outside the checkout. The live steps are owner steps, under the owner-steps heading.

## Dry runs (no live action, safe to run)

1. Write the winget set locally for a release. This writes three files into the scratch directory and
   submits nothing:

       wingetcreate update DeBIOSFoundation.PowerBrowser --version <version> --urls <installer-url> --out <scratch-dir>/winget

   `<version>` is the release key without its leading v. `<installer-url>` is the Windows asset URL under
   the release key. Until Phase 54 names the Windows asset, the row treats the installer as the fixture.

2. Check the cask's Ruby syntax through the locked nixpkgs (reads from the binary cache; writes nothing):

       nix --extra-experimental-features 'nix-command flakes' shell --inputs-from . nixpkgs#ruby --command ruby -c homebrew-tap/Casks/powerbrowser.rb

   This prints `Syntax OK` on the tracked cask.

3. The quick rows for both payloads:

       scripts/verify-platform.sh --only winget-manifest
       scripts/verify-platform.sh --only homebrew-cask

## Owner steps (not executed in this tree)

### winget pull request (owner account that holds WINGET_TOKEN)

1. Fork microsoft/winget-pkgs on the owner account. That account is the holder recorded in
   `docs/RENEWALS.md` for WINGET_TOKEN.
2. Put the classic personal access token (public_repo scope) in the shell environment from the owner's
   store, as `WINGET_CREATE_GITHUB_TOKEN`. Never paste it into a command, a file or a log. wingetcreate
   can echo a token passed with `--token`, so use the environment form only. wingetcreate does not support
   fine-grained tokens (its token documentation, read 2026-10-31), so the token's reach is bounded by the
   account: use a dedicated bot account whose only write access is its winget-pkgs fork.
3. Submit the rendered set from the scratch directory. Subcommand `submit`, token from the environment:

       wingetcreate submit <scratch-dir>/winget

4. Record the pull request link here, with the date: ____

The winget environment (not the release environment, which holds the signing key) stores the same token as the
environment secret WINGET_TOKEN. The DIST-12 leg reads it there by name, in the one step that submits, and passes
it to wingetcreate through `WINGET_CREATE_GITHUB_TOKEN`. The first version is the tracked `winget/` set, rendered with
the verified installer digest; later versions use `wingetcreate update`, whose output digest is checked against the
verified one before the submission. No App token can open this pull request, which is the recorded Apps-only
exception.

### Homebrew tap commit (DIST-12, bot App, no pull request)

1. Create the tap repository (Phase 41 owner step) and install the bot App on it.
2. The bot App commits the rendered cask to the tap repository's `Casks/` path and pushes the
   default branch directly. The tap repository accepts a direct push from the bot App's token, so this
   leg opens no pull request.
3. Record the tap commit link here, with the date: ____

### Gatekeeper and notarization (Phase 55, not claimed here)

The cask makes no signing or Gatekeeper claim. The aarch64 enablement and the Gatekeeper passage wait on
the Phase 55 notarized disk image (assumption A3). Record the Phase 55 evidence link here before the
cask's darwin deferral marker is removed: ____
