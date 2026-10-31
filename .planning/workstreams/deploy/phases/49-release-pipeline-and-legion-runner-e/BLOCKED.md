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

## 49-02 Task 3 (owner-pending): legion runner registration and NixOS change

Plan 49-02 Tasks 1 and 2 are done: the hook and its row (commit 37a9b29), and the non-ephemeral
runner shape in docs/RELEASING.md (commit 77a3209). Task 3 is a `checkpoint:human-action` and was
not performed. No runner is registered, no registration token is minted, nothing is written to
`/etc/nixos`, and `nrs` was not run. Plan 49-02 stays partial until the owner replies with the
result of step 10 and the live `repo-controls` line is recorded in 49-02-SUMMARY.md.

Owner steps, in order:

1. Confirm the precondition (read-only). `scripts/verify-platform.sh --only repo-controls` is green
   against the live org and repo (SEC-11 fork approval, GH-07 environment branch policies). The
   pre-job hook (SEC-10) is tracked and `hook-refusal` is green. The GH-11 runner-group probe
   outcome is not recorded in docs/RELEASING.md yet: record it there with its date, then decide
   nothing else from it (it only decides whether a runner-group restriction sentence is claimed).
2. Use the release home `https://github.com/Deocracy/powerbrowser`. This is the owner ruling of
   2026-10-29 recorded in `inventory/brand-tokens.json`. The `DeBIOS-Foundation` URL in
   49-RESEARCH.md's NixOS block is superseded; do not use it.
3. Install the hook as a byte-identical copy in the NixOS config tree, then compare hashes:
   `pkexec install -D -m 0644 <clone>/scripts/legion-pre-job-hook.sh /etc/nixos/pb-runner/legion-pre-job-hook.sh`
   `sha256sum <clone>/scripts/legion-pre-job-hook.sh /etc/nixos/pb-runner/legion-pre-job-hook.sh`
   The two hashes must match. `environment.etc` sets the 0555 mode on the deployed path.
4. Add the block from docs/RELEASING.md, section "Runner registration through the `/etc/nixos` flow",
   to `/etc/nixos/configuration.nix`: the `services.github-runners.powerbrowser-release` unit (user and
   group `pb-runner`, work directory `/var/lib/pb-runner`, label `powerbrowser-release`,
   `tokenType = "registration"`, `ephemeral = false`, and
   `extraEnvironment.ACTIONS_RUNNER_HOOK_JOB_STARTED` pointing at `/etc/pb-runner/legion-pre-job-hook.sh`),
   `users.users.pb-runner` with `isSystemUser` and `autoSubUidGidRange`, `users.groups.pb-runner`, and
   `environment.etc."pb-runner/legion-pre-job-hook.sh"`. The option names are verified (last section of
   this file). Do not create a `configuration.nix.pre-*` backup; git history is the backup. Where the
   runner lets the unit choose the hook's interpreter, start the hook as
   `/run/current-system/sw/bin/bash -p --noprofile --norc /etc/pb-runner/legion-pre-job-hook.sh`
   (`-p` ignores `BASH_ENV`, `ENV` and imported functions) and record whether the runner allows that.
5. Dry-build before applying: `pkexec nixos-rebuild dry-build` must succeed.
6. Mint the one-time registration token immediately before the rebuild that registers the runner:
   `gh api -H 'X-GitHub-Api-Version: 2022-11-28' -X POST repos/Deocracy/powerbrowser/actions/runners/registration-token --jq .token`
   Write it once: `pkexec bash -c 'install -d -m 0700 /var/lib/secrets; printf %s "<token>" > /var/lib/secrets/github-runner-registration; chmod 0600 /var/lib/secrets/github-runner-registration'`.
   The token expires after one hour. No PAT and no App key go to legion.
7. Apply: `pkexec bash -c 'export PATH=/run/current-system/sw/bin:/run/wrappers/bin:$PATH; nrs "feat: legion non-ephemeral github runner for powerbrowser release builds (SEC-08, SEC-10)"'`.
   `nrs` commits, rebuilds, and pushes in one step. Bare `nrs` fails under Claude's sudo; the pkexec form is the only one.
8. Check the runner user boundary (the registration file stays in place, so this can run at any time):
   `sudo -u pb-runner test -r /home/chris/.config/powerbrowser-release/mar-key && echo READABLE` and
   `sudo -u pb-runner test -r /var/lib/secrets/github-runner-registration && echo READABLE`. Both must
   print nothing. If either prints READABLE, stop and fix the ownership or the home-directory mode first.
9. Confirm the runner. `gh api repos/Deocracy/powerbrowser/actions/runners --jq '.runners[] | {name, status, labels: [.labels[].name]}'`
   shows one runner named `legion`, online, with the label `powerbrowser-release`. **Leave the token file
   `/var/lib/secrets/github-runner-registration` in place.** The module reads `tokenFile` as a service
   credential on every start, so deleting it breaks the unit at the next restart or reboot; the expired
   token inside it is harmless. Mint a fresh one-time token only for a deliberate re-registration
   (changing the file's content, or `url`, `name`, `workDir`, `extraLabels`, `ephemeral` or `runnerGroup`,
   re-registers). Never restore a PAT.
10. Refusal drills. Both are mandatory before the runner is trusted and before criterion 1 is marked met.
    - Local, no GitHub write: `env -i GITHUB_REPOSITORY=Deocracy/powerbrowser GITHUB_WORKFLOW_REF='Deocracy/powerbrowser/.github/workflows/release.yml@refs/heads/feature' GITHUB_EVENT_NAME=workflow_dispatch GITHUB_RUN_ATTEMPT=1 /run/current-system/sw/bin/bash --noprofile --norc /etc/pb-runner/legion-pre-job-hook.sh`
      must exit 1 and name `refs/heads/main`.
    - Live (mandatory, WR-02): the "Runner acceptance drill" in docs/RELEASING.md. Push a throwaway branch
      `drill/hook` (not `main`) holding the three-job `hook-drill.yml` it gives, on the powerbrowser-release
      label: (a) job-level `env:` setting the release triple, (b) `BASH_ENV` set, (c) a `container:` job.
      Each job must be refused at set-up before any step runs and before any container is pulled. Record,
      per job, the conclusion, whether a step ran, the hook's refusal line as it appears in the job log, and
      whether a container was created (`sudo -u pb-runner podman ps -a` before and after). If any job reaches a
      step, the runner must not be used: stop the unit, remove the registration and redesign the control.
      Then delete the branch. Also record whether the runner allows the hook interpreter to be chosen (step 4).
    - Hook drift (IN-03): `sha256sum <clone>/scripts/legion-pre-job-hook.sh /etc/pb-runner/legion-pre-job-hook.sh`
      must print one hash twice; repeat after any later edit of the tracked hook.
11. Reply with: the runner id and labels; the github-runner version the unit runs, next to the upstream version
    (Open Question 3; the lock-versus-upstream note in docs/RELEASING.md records 2.333.1 against 2.336.0 at the
    time of writing); the GH-11 probe outcome; the result of both drills in step 10 (per job: refused or step reached, the log line, container created or not); then the word "resume". The executor then runs
    `scripts/verify-platform.sh --only repo-controls` live, records that line and the version pair in
    49-02-SUMMARY.md, and only then marks criterion 1 locally met.

Items this record adds for the owner:
- Repo slug drift: the research and fixtures use `DeBIOS-Foundation/powerbrowser`; the owner ruling and
  `configuration.toml` use `Deocracy/powerbrowser`. The hook and the docs follow the ruling. The public
  `DeBIOS-Foundation/powerbrowser` repository also exists; confirm which is the release home before step 6.

### 49-02 Task 3: option names verified (2026-10-31, nixos MCP, channel unstable)

This section is authoritative; steps 4, 8 and 9 above and docs/RELEASING.md now follow it.

All exist: `services.github-runners.<name>.{enable, url, name, user, group, workDir, extraLabels, noDefaultLabels, extraPackages, tokenFile, tokenType, ephemeral, replace, runnerGroup, extraEnvironment, nodeRuntimes}`, `users.users.<name>.{autoSubUidGidRange, isSystemUser}` (exactly one of `isNormalUser` and `isSystemUser`), `users.groups`, and `environment.etc.<name>.{source, mode}` (a mode other than `"symlink"` copies the file). Two corrections to the original steps, now applied:

1. Use `services.github-runners.powerbrowser-release.extraEnvironment.ACTIONS_RUNNER_HOOK_JOB_STARTED = "/etc/pb-runner/legion-pre-job-hook.sh";` (the module's own option), not a separate `systemd.services.github-runner-powerbrowser-release.environment` entry. Set `tokenType = "registration";` explicitly rather than relying on auto-detection.
2. Per the `tokenFile` option text, a registration token is valid for one hour, and changing the file's content or any registration-triggering option (url, name, workDir, extraLabels, ephemeral, runnerGroup) re-registers. Do not delete the token file while the option points at it: leave the (expired, harmless) file in place after the first successful registration, and mint a fresh one-time token only before a deliberate re-registration. Keep `ephemeral = false`; ephemeral with a registration token fails on restart.

Not verified (owner checks at apply, `nixos-rebuild dry-build` does not catch either):

- The module's behaviour with a static `user` plus a custom `workDir`: state directory ownership and sandbox write paths.
- Rootless podman for `pb-runner` (`podman` is in `extraPackages` and `autoSubUidGidRange` is set, but nothing has run a container as that user).
- Whether the runner lets the unit choose the hook's interpreter (see step 4).
