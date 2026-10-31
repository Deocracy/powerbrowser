# Phase 49: owner actions and gaps blocking the first release dispatch

Plans 49-01 and 49-03 are built and their rows are green. Nothing below was run: no
dispatch, approval, token mint, key read, push or publish was performed. Each item is
needed before a real `release.yml` dispatch can complete.

## Owner actions (live account and key steps)

1. **Bot App variable and key (for the publish and tag).** In the repository (or the
   `release` environment), set the variable `BOT_APP_CLIENT_ID` to the powerbrowser-bot
   App's client ID, and the secret `BOT_APP_PRIVATE_KEY` to its private key. The App must
   carry contents write and no Workflows permission (decision 1). Without them the
   `bot` step fails and nothing is published, which is the intended fail-closed result.
2. **MAR signing secrets (release environment only).** Add `MAR_SIGNING_P12_B64` (the
   base64 of the MAR signing PKCS#12) and `MAR_SIGNING_P12_PASSWORD` to the `release`
   environment. The tracked DER, `powerbrowser/packaging/mar/mar-primary.der`, is the only
   key material in the tree. Nothing in this run read the secrets.
3. **Safe Browsing key directory on legion.** Set the repository variable `PB_KEYDIR` to
   the host directory holding `sb-gapi.data`, mounted read-only into the build container.
   Without it the build step fails closed by design.
4. **Asset-name table.** In `docs/RELEASING.md`, fill the `linux-x86_64` row of the
   `## Release asset names` table, and confirm two naming choices the release now uses:
   the version is the tag minus its leading `v` (so it carries the `-<revision>`), and the
   source tarball is `<app_basename>-<version>.source.tar.gz`. The on-disk tarball's
   `en-US` locale token is dropped on the release names.
5. **Release approval.** Per-release approval of the `release` environment is an owner
   action at release time. Nothing here approves or dispatches a run.

## Engineering gaps (not owner actions; close on the first real run or before it)

6. **Complete MAR emit.** `build-linux` uploads `objdir-release/dist/*.complete.mar`, but
   no step produces it: `package-linux.sh` packages the tarball and the manifest only. The
   Phase 45 MAR emit (`make_full_update.sh` against the release objdir) must be added as a
   build step. Until then the upload step fails with `if-no-files-found: error`.
7. **packaged-launch and install-matrix rows.** Plan 49-01 says `build-linux` runs the
   packaged rows. The registry labels `ng063-packaged-launch`, `portable-elf`,
   `sidecar-no-symlinks`, `package-target-natives` and `packaged-identity` exist, but
   `install-matrix` is not registered, and the packaged rows need the built tree. None is
   invoked yet.
8. **signmar source, output format and runtime (review BL-01, resolved by design, owner to confirm).**
   `sign-publish` no longer runs a legion-built `signmar`. `scripts/build-signmar.sh` builds it on the
   hosted runner from the pinned Firefox source: the pin is
   `powerbrowser/packaging/signmar/SOURCES.sha256` (ESR tag, the 40-hex commit the tag names
   `6cd88e7d45fe7a5b0b87b984fb32a8779151860e`, and the sha256 of 15 libmar and CityHash files), fetched
   by exact commit from raw.githubusercontent.com and refused on any mismatch. Measured on this host
   under Nix (NSS 3.112): the pinned source compiles with `cc -DMAR_NSS` against the system NSS, signs
   and `-v` verifies a MAR, and `scripts/verify-mar-signature.mjs` verifies the same MAR; `-T` prints
   `MAR channel name: <id>`, which the gate's sed matches. Not measured: the build against ubuntu-latest's
   `libnss3-dev` (Ubuntu 24.04 ships an older NSS than 3.112), and the Nix-built tools are not the apt
   ones. Owner action: confirm the pin (the commit and hashes were computed from the tracked `upstream/`
   checkout at the pinned tag and re-fetched from GitHub by commit) and that building a signer from
   source on the hosted runner is acceptable in place of the "container-built signmar" wording of SEC-07;
   `REQUIREMENTS.md` SEC-07 and `49-RESEARCH.md` still say container-built and were not edited here.
   An ESR move needs the pin re-recorded in the same reviewed commit (the `release-shape` row goes red
   until the pin's tag line equals `configuration.toml`).
9. **Post-publish artifact deletion.** The artifact cap mitigation (`retention-days: 1`
   plus deletion after publish) is only the retention half. Deletion is not wired.

10. **build-linux now fetches upstream, applies patches and builds Theia (review WR-07).**
    The three steps (`fetch-upstream.sh` plus `apply-patches.sh`, then `yarn install --ignore-scripts
    --frozen-lockfile`, the drivelist `node-gyp rebuild`, `yarn build` in the Nix theia shell) are
    authored from `docs/BUILD.md` and `verify.yml` and never run on legion. Open: the Theia build
    downloads plugins over the network during `yarn build`; whether the legion unit allows that is
    unmeasured. Items 6 and 7 stand.
11. **R2 copy and the deliberate failure (review WR-06).** `sign-publish` carries a step `r2_gate`
    that fails every run after the draft is verified and before the bot token is minted, so nothing
    can publish without the DIST-08 copy. Plan 49-05 replaces it with an `r2_copy` step in the same
    commit; the `release-asset-set` row accepts either and goes red if neither is there.
12. **Runner group and ref control (review WR-11).** The first-step ref refusal is defence in depth
    only. Plan 49-02 must register the runner in a group restricted to
    `release.yml@refs/heads/main`; the `release` and `descriptor` environments already carry the
    main-only branch policy (`.github/settings/environment-*.json`, checked by `repo-controls`).
13. **Fresh dispatch after a late failure (review IN-04).** `release-linux` is uploaded with
    `overwrite: true`, so a re-run of `build-linux` replaces it; a stale draft for the same tag is
    deleted by `sign-publish`. Start a fresh dispatch after a late failure all the same.

## Broken-windows register (owner)

14. `.planning/WINDOWS.md` is refused by the append tool: its rendered table disagrees with
    its fenced JSON for rows 10, 11 and 19 (pre-existing; not created by this run). Regenerate
    the file (the tool's own instruction), then append these stub entries:
    - `stub`: release.yml descriptor placeholder (until plan 49-04)
    - `stub`: release.yml channel-live placeholder (until plan 49-04)
    - `unrun-verify`: build-linux steps authored from the Phase 45 procedure, never run

## Not executed in this run (by instruction)

- Plan 49-02 (legion runner, pre-job hook, owner registration), plan 49-04 (descriptor and
  channel-live), plan 49-05 (R2 origin, allowlist, R2 copy) remain. The `descriptor` and
  `channel-live` placeholders in release.yml stay fail-closed until 49-04 lands.
