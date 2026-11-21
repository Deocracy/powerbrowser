# Fix brief: G5b-packaging-docs

Lane: product. Items: 11. Files this group owns: `^powerbrowser/packaging/` (pattern), `^systemd/` (pattern), `powerbrowser/endpoint-allowlist.json`, `^powerbrowser/branding/` (pattern), `^website-staging/` (pattern), `^docs/(?!URI-SCHEMES)` (pattern), `scripts/generate-licensing.mjs`, `scripts/generate.mjs`, `scripts/lib/orca-shipped-packages.mjs`, `^inventory/` (pattern), `configuration.toml`, `LICENSING.md`, `^theia/applications/` (pattern), `theia/package.json`.

Item IDs: packaging-prefs-network-04; packaging-prefs-network-02; 59-CR-01; 59-CR-02; packaging-prefs-network-01; 63-CR-01; packaging-prefs-network-03; 68-WR-02; 60-WR-02; packaging-prefs-network-06; packaging-prefs-network-05.

## packaging-prefs-network-04: The endpoint allowlist does not cover several hosts Orca hosting contacts, and two 'allow' rows justified by other features silently admit Orca's requests

- **Severity:** medium
- **Verdict:** CONFIRMED
- **Location:** `powerbrowser/endpoint-allowlist.json:211`
- **Owner decision cited:** D-08

**What is wrong.** The allowlist claims to be 'the single machine-readable source of truth for every endpoint this build is allowed to contact'. Two rows hide Orca traffic. www.google.com has disposition allow (unattended) with a Widevine-redirect reason, but Orca's side panel and settings fetch https://www.google.com/s2/favicons?domain=<agent or repo host>. The v1.7 rows themselves say whether launching straight into Orca mode contacts these hosts is an open owner item. Because www.google.com is 'allow', an unattended favicon request to it passes the verdict model. Only the gstatic redirect targets are user-initiated. The same applies to cdn.jsdelivr.net (allow, reason: uBlock filter lists), which also admits Orca's web-client emoji image loads (cdn.jsdelivr.net/npm/emoji-datasource-*). Hosts that the shipped Orca bundles contact on a user action and that have no row at all: huggingface.co (speech model download), storage.googleapis.com (skill install), nodejs.org and unofficial-builds.nodejs.org (orcad remote install), avatars.githubusercontent.com, app.orca.dev (skill share; not under .onorca.dev), linear.app or the Linear API, api.atlassian.com, api.bitbucket.org and dev.azure.com.

**Scenario.** PowerBrowser starts in Orca mode. The Orca sidebar loads its agent icons from www.google.com/s2/favicons?domain=claude.ai&sz=64 before any click, which tells Google which agents the user has and, through repo-icon.ts, the hostnames of the user's repository websites. verify-endpoints passes, because www.google.com is an unattended 'allow' host for Widevine. Separately, a user who turns on speech input triggers a huggingface.co download that the allowlist marks as an unknown-host failure, so the gate's picture of v1.7 egress is incomplete in both directions.

**Preconditions.** Orca mode or its side panel is shown (favicons), or the user uses the named Orca features.

**Evidence.** powerbrowser/endpoint-allowlist.json:211 `"host": "www.google.com", "disposition": "allow"` with reason `part of the same Widevine update-check flow`. The t0..t3.gstatic.com rows: `Whether launching straight into the Orca mode may contact it is an open owner item`. orca/src/renderer/src/lib/agent-catalog.tsx:105 and orca/src/shared/repo-icon.ts:28 build `https://www.google.com/s2/favicons?domain=...`. orca/src/main/speech/model-download-catalog.ts builds huggingface.co URLs. orca/src/main/runtime/runtime-skill-install-commands.ts:84 uses `['https://storage.googleapis.com']`. orca/src/shared/node-runtime-pin.ts names nodejs.org and unofficial-builds.nodejs.org. orca/out/web contains cdn.jsdelivr.net/npm/emoji-datasource-* image URLs.

**Suggested fix.** Give Orca's favicon traffic its own handling. Either route the s2/favicons and emoji image loads through a local placeholder in the overlay, or make the verdict model attribute www.google.com by path or initiator so that an Orca-originated request needs a user action. Add user-initiated rows, with reasons tied to the Orca source, for every host the shipped Orca bundles can reach. Add a static check that extracts hosts from orca/out and compares them with the allowlist both ways.

**Verifier (CONFIRMED, medium).** The verdict rule (scripts/lib/endpoint-verdict.mjs:26) matches on host only. An 'allow' host passes whatever the initiator and whether or not the user acted. www.google.com is 'allow' with a Widevine-redirect reason only, and orca/src/renderer/src/lib/agent-catalog.tsx:105 and orca/src/shared/repo-icon.ts:28 load https://www.google.com/s2/favicons?domain=..., which also appears in the shipped orca/out/web assets. An unattended Orca favicon request to www.google.com therefore cannot fail the gate, and only its gstatic redirect targets are user-initiated. cdn.jsdelivr.net is also 'allow' for uBlock, and emoji-datasource URLs are in out/web (emoji-picker-react, RepositoryIconEmojiPicker). The host list contains no rows for huggingface.co, storage.googleapis.com, nodejs.org, unofficial-builds.nodejs.org, avatars.githubusercontent.com, app.orca.dev, api.atlassian.com, api.bitbucket.org or dev.azure.com, yet each appears in the shipped orcad-server.js or out/web bundles. Absent hosts fail rather than pass, so that half is incompleteness, not masking. One step depends on runtime behaviour: whether favicons load at a startup straight into Orca mode, which the allowlist records as an open owner item. The masking by the 'allow' rows holds statically either way. *Checked at:* scripts/lib/endpoint-verdict.mjs:26 (host-only verdict); powerbrowser/endpoint-allowlist.json www.google.com and cdn.jsdelivr.net rows ('allow'); orca/src/renderer/src/lib/agent-catalog.tsx:105; orca/src/shared/repo-icon.ts:28; host list has no rows for the named hosts

## packaging-prefs-network-02: Orca's own MIT copyright and permission notice (Lovecast Inc.) ships nowhere in the package or the notices

- **Severity:** medium
- **Verdict:** CONFIRMED
- **Location:** `scripts/generate-licensing.mjs:309`

**What is wrong.** PowerBrowser ships orcad.js, orcad-server.js and the out/web client, all compiled from Orca's MIT-licensed source. The MIT licence requires its copyright and permission notice in all copies or substantial portions. renderOrcaSection lists only the third-party npm packages found inside the bundles. stage_orca copies only package.json, out/orcad and out/web, so orca/LICENSE is not staged. LICENSING.md says only that Orca's licence is 'checked by inventory/licence-allowlist.json', which is a repository file and not a notice. The pinned orca/package.json has no license field, and no file under orca/out carries the notice.

**Scenario.** A user installs PowerBrowser 153.5.1 with <GreD>/orca. Neither THIRD-PARTY-NOTICES.txt nor anything under <GreD>/orca contains 'Copyright (c) 2026 Lovecast Inc.' or the MIT permission text, so the distribution does not meet the MIT notice condition for the Orca code it redistributes.

**Preconditions.** None; this applies to every v1.7 package.

**Evidence.** scripts/generate-licensing.mjs:309-318 renderOrcaSection pushes ORCA_HEADING, a source line, then only `licenceGroups(packages)` (third-party packages). powerbrowser/packaging/package-linux.sh stage_orca: `cp -a "$1/package.json" ...; cp -a "$1/out/orcad" ...; cp -a "$1/out/web" ...` (no LICENSE). `grep -rn Lovecast` outside orca/ and .planning matches only inventory/licence-allowlist.json; `grep -rlF Lovecast orca/out/orcad orca/out/web` matches nothing. inventory/licence-allowlist.json:46-49 records `holder: Lovecast Inc.` and the licence digest, but nothing renders it.

**Suggested fix.** Render orca/LICENSE verbatim at the head of the Orca section in renderOrcaSection, read from the fetched tree and checked against licence_file_sha256. Also stage orca/LICENSE as <GreD>/orca/LICENSE in all three packaging scripts, and add the Orca root licence to the generate-licensing --check comparison.

**Verifier (CONFIRMED, medium).** renderOrcaSection (scripts/generate-licensing.mjs:308-318) writes the heading, a provenance line, then only licenceGroups(packages), which are the third-party npm packages. The tracked THIRD-PARTY-NOTICES.txt Orca section (line 17965 onward) starts directly with @antfu/install-pkg, and 'Lovecast' appears nowhere in it. stage_orca (powerbrowser/packaging/package-linux.sh:29-35) copies package.json, out/orcad and out/web only, so orca/LICENSE (MIT, 'Copyright (c) 2026 Lovecast Inc.') is never staged. The orca/package.json pin has no license field, and grep -rlF Lovecast over orca/out finds nothing. LICENSING.md:25 only points to inventory/licence-allowlist.json, a repository file that does not ship. That allowlist row (lines 40-50) records holder and digest, but no generator renders it. No guard puts the notice into the package. This is a licence-compliance correctness gap, not a security issue. *Checked at:* scripts/generate-licensing.mjs:308-318; powerbrowser/packaging/package-linux.sh:29-35; THIRD-PARTY-NOTICES.txt:17965-17975 (no Orca self-notice); orca/LICENSE:1-3; inventory/licence-allowlist.json:46-49

## 59-CR-01: Runner work directory is never created, so the runner unit fails at namespace setup

- **Severity:** medium (reviewer label: critical)
- **Verdict:** CONFIRMED
- **Location:** `systemd/legion-pb.nix`

*Section CR-01 of `.planning/workstreams/orca/phases/59-carry-forward-from-v1-5-and-v1-6/59-REVIEW.md`, verbatim:*

**File:** `systemd/legion-pb.nix:42`
**Issue:** `workDir = "/var/lib/pb-runner"` is set, and nothing creates that directory:

- The nixpkgs 26.05 module on legion (`github-runner/service.nix:256`, `:312`) sets `WorkingDirectory = workDir` and `BindPaths = [ cfg.workDir ]`, with no `-` prefix. A missing source path aborts the unit before any `ExecStartPre` runs (226/NAMESPACE or 200/CHDIR).
- The module has no tmpfiles rule for the directory.
- `users.users.pb-runner` is an `isSystemUser` with the default home `/var/empty` and no `createHome`.
- The header's install steps 1-5 never create the directory either.

The runner therefore never comes online after `nrs`. Separately, the module sets `HOME = workDir` (`service.nix:56`) and wipes `workDir` on every start (`service.nix:164`). Any per-user state kept under HOME, including the rootless podman image store, is lost on each restart.
**Fix:**
```nix
systemd.tmpfiles.rules = [
  "d /var/lib/powerbrowser-release 0750 root pb-runner -"
  "d /var/lib/pb-runner 0750 pb-runner pb-runner -"
];
```

**Verifier (CONFIRMED, medium; scope: host config (legion release runner, systemd/legion-pb.nix, owner-installed and not yet deployed)).** (1) systemd/legion-pb.nix:42 sets workDir = "/var/lib/pb-runner". The file's only tmpfiles rule (line 71) creates /var/lib/powerbrowser-release, not the work directory. users.users.pb-runner (lines 51-56) is isSystemUser with no home and no createHome. The header's install steps 1-5 do not create the directory.
(2) The module on disk is legion's root channel nixos-26.05 (.version-suffix .14894.ab5c18f), at nixos/modules/services/continuous-integration/github-runner/service.nix. Line 43 uses cfg.workDir when it is non-null. Line 256 sets WorkingDirectory = workDir and line 312 sets BindPaths = [ cfg.workDir ], both without the "-" prefix. StateDirectory, RuntimeDirectory and LogsDirectory (lines 250-254) are github-runner/powerbrowser-release, so systemd never creates /var/lib/pb-runner. The module has no tmpfiles rule. The workDir option text in options.nix:270-282 does not say the module creates the directory.
The local systemd.exec(5) man page says a BindPaths entry "may be prefixed with '-', in which case it will be ignored when its source path does not exist". Without the prefix, a missing source fails namespace setup (exit 226/NAMESPACE), and a missing WorkingDirectory without "-" is fatal (200/CHDIR). Both are checked before any ExecStartPre runs, including the "+" root unconfigure script, whose `find -H "$WORK_DIRECTORY"` (line 165) would fail anyway on a missing directory. The secondary claims also hold: HOME = workDir (line 56), and the work directory is wiped on every start (line 165).
(3) Nothing else in the tree creates the directory. rg finds /var/lib/pb-runner only in this file, in docs and in planning text. docs/RELEASING.md:1989 says incorrectly that the work directory "comes back" declaratively.
(4) Counter-evidence check: the unit is not deployed. /run/current-system (legion-git-c575adc-26.05.14630) has no github-runner-* or codeberg-mirror unit. systemctl list-units/cat find no github-runner-powerbrowser-release. /var/lib/pb-runner does not exist. /etc/nixos is not visible from this sandbox, so I could not read configuration.nix directly. Since nothing is deployed, no recorded live or gate result contradicts the claim, and no STATE, VERIFICATION or WINDOWS entry records the runner coming online. The defect is latent: the failure happens on the owner's first nrs after installing the file.
Severity: medium. This is a release CI path that fails on start. The owner sees it at once and the fix is one line. It crosses no privilege boundary and breaks no shipped user feature.

## 59-CR-02: Module default hardening makes the rootless podman that release.yml needs impossible on this runner

- **Severity:** medium (reviewer label: critical)
- **Verdict:** CONFIRMED
- **Location:** `systemd/legion-pb.nix`

*Section CR-02 of `.planning/workstreams/orca/phases/59-carry-forward-from-v1-5-and-v1-6/59-REVIEW.md`, verbatim:*

**File:** `systemd/legion-pb.nix:32-56`
**Issue:** The file sets `extraPackages = [ ... podman ]` and `autoSubUidGidRange = true # rootless podman`. `release.yml:179-201` and `:603-652` run `podman build` and `podman run` on this runner. The nixpkgs module applies these service defaults (`service.nix:274-305`):

- `RestrictNamespaces = true`, which blocks `unshare(CLONE_NEWUSER)`;
- `PrivateUsers = true`, which maps only the service uid;
- `NoNewPrivileges = true`, which stops the setuid `newuidmap` and `newgidmap` wrappers from gaining privilege;
- `SystemCallFilter = ~@mount`.

Rootless podman needs every one of these, so every release build job fails on this runner. The header (lines 27-28) warns only about libvirt. `docs/RELEASING.md:423` lists podman as "not verified", but the module source on this host proves the failure. No `serviceOverrides` is set.
**Fix:** Relax the module defaults for this runner explicitly, and record why:
```nix
services.github-runners.powerbrowser-release.serviceOverrides = {
  RestrictNamespaces = false;   # rootless podman creates user/mount namespaces
  PrivateUsers = false;         # newuidmap must map the subuid range of pb-runner
  NoNewPrivileges = false;      # newuidmap/newgidmap are setuid wrappers
  SystemCallFilter = [ "~@clock" "~@cpu-emulation" "~@module" "~@obsolete" "~@raw-io" "~@reboot" ];
  PrivateMounts = false;
};
```
Also set a podman storage location outside the wiped `workDir`, for example `extraEnvironment.XDG_DATA_HOME = "/var/lib/pb-runner-data"` plus a tmpfiles rule.

**Verifier (CONFIRMED, medium; scope: linux product release path: release.yml build-linux and build-windows on the self-hosted legion runner (host config systemd/legion-pb.nix)).** I traced the whole path from source on disk.

(1) The cited code exists as described. systemd/legion-pb.nix:32-50 defines services.github-runners.powerbrowser-release with user/group pb-runner, extraPackages including podman, and no serviceOverrides. :54 sets autoSubUidGidRange = true with the comment "rootless podman". The header comment at :27-28 names only the libvirt socket as a sandboxing risk. No serviceOverrides or RestrictNamespaces setting exists anywhere in the repo outside orca/ and upstream/. The only other mention is a libvirt-related suggestion in deploy phase 54 BLOCKED.md:174.

(2) The failure path:
- The host's nixpkgs 26.05 module (channel /nix/store/fyjl37xdh4z542jbd34s40ky9hp9zmmc-nixos-26.05, github-runner/service.nix:274-304) sets these as mkDefault: NoNewPrivileges, PrivateUsers, RestrictNamespaces, PrivateMounts, PrivateDevices, RestrictSUIDSGID and ProtectProc=invisible.
- service.nix:293-304 adds, through mkBefore, a SystemCallFilter that denies @mount, @clock and capset.
- service.nix:332-339 only switches off DynamicUser for a static user. The only override path is cfg.serviceOverrides at :340, and the file leaves it empty.
- release.yml:72-73 (build-linux) and :501-503 (build-windows) run on [self-hosted, powerbrowser-release], the label this file registers. They run podman build at :179 and :603, and podman run at :187, :201, :615 and :652.
- The on-disk systemd 260.5 man page, systemd.exec(5), says of RestrictNamespaces: "If true, access to any kind of namespacing is prohibited". So unshare/clone with CLONE_NEWUSER returns EPERM.
- The podman 5.8.9 man page on disk (podman-unshare(1)) states that rootless podman runs in a new user namespace whose subuid/subgid ranges are mapped by the newuidmap/newgidmap helpers.
- On this host those helpers are setuid wrappers (/run/wrappers/bin/newuidmap, mode r-s--x--x). NoNewPrivileges=true neutralises the setuid bit.
- PrivateUsers=true maps only the service uid, so subuid ranges cannot be mapped even if namespace creation succeeded.
- ~@mount blocks the bind mounts that -v needs.

Rootless podman therefore cannot start a container under this unit, and pb-runner has no path to rootful podman.

(3) Nothing prevents it. No override exists in the repo. The live /etc/nixos is not readable from this sandbox. systemctl reports that github-runner-powerbrowser-release.service "could not be found", so the module is not applied on the host and no host-side override is active.

(4) No recorded result contradicts the finding:
- No release.yml run on the self-hosted runner is recorded in .planning, WINDOWS.md, STATE.md or the orca VERIFICATION files.
- 68-VERIFICATION.md:110 marks the Linux container release as "UNCERTAIN (first release)" and points to WINDOWS entry 30 (owner steps).
- docs/RELEASING.md:422-423 itself lists "whether rootless podman works for pb-runner" as not verified.

Severity: this is a release build path that fails, closed and before any artifact exists. It is not an integrity or user-facing failure, so it is medium rather than critical. It is also currently hidden behind CR-01: the unit fails at namespace setup before any job runs.

Problem with the proposed fix: serviceOverrides is mkMerge'd in, so a plain SystemCallFilter list is appended to the module's mkBefore deny list rather than replacing it. ~@mount and ~capset would remain, and crun needs capset. Relaxing the filter needs lib.mkForce. PrivateDevices=true also hides /dev/fuse, which fuse-overlayfs needs if native rootless overlay is unavailable. The fix should be checked on the host after it is applied.

## packaging-prefs-network-01: The release runner user is in libvirtd (root-equivalent on legion), and v1.7 runs Orca's whole from-source build on that persistent runner outside any container

- **Severity:** medium
- **Verdict:** CONFIRMED
- **Location:** `systemd/legion-pb.nix:55`

**What is wrong.** legion-pb.nix puts pb-runner, the user every release.yml job on legion runs as, into the libvirtd group. Read-write access to qemu:///system is root-equivalent: a domain can be defined with host filesystem passthrough or a host block device. The runner is non-ephemeral (ephemeral = false, line 37), and LIBVIRT_DEFAULT_URI=qemu:///system is exported to every job. v1.7 adds a build-linux step that runs `nix develop .#orca --command bash scripts/build-orca.sh` directly on the host, not inside the rootless pb-gecko-build container that Gecko is built in. build-orca.sh installs with --ignore-scripts, but it then runs upstream Orca code and code from the npm closure: config/scripts/*.mjs, vite and esbuild with their plugins, `pnpm run rebuild:node` (node-gyp), and mobile's generator scripts. All of that runs as pb-runner. The pre-job hook keeps out other repos, other workflows and fork PRs. It does nothing against code inside the pinned build inputs.

**Scenario.** Threat (f): an Orca re-pin (rebase-orca or the release-train repin-orca, weekly) takes in a compromised Orca commit, or a lockfile package whose build-time code is malicious (a vite plugin, or a package whose module top level runs when esbuild or vite loads it). On the next release dispatch the build-linux job runs that code as pb-runner on legion. It calls `virsh define` on a domain that mounts / from the host and boots it, which gives root on the owner's workstation. Because the runner is persistent, it can also leave files in /var/lib/pb-runner, .mozbuild/pnpm-store or the corepack cache that alter later release builds. The hosted signer then signs a tampered tarball.

**Preconditions.** A malicious change reaches the pinned Orca commit or its lockfile closure (upstream compromise plus a merged re-pin), and the owner dispatches a release.

**Evidence.** systemd/legion-pb.nix:37 `ephemeral = false;`, :48 `LIBVIRT_DEFAULT_URI = "qemu:///system";`, :55 `extraGroups = [ "libvirtd" ];`. .github/workflows/release.yml:73 `runs-on: [self-hosted, powerbrowser-release]`, :169-174 `bash scripts/fetch-orca.sh` / `nix develop .#orca --command bash scripts/build-orca.sh` (host shell, not podman), unlike :187 where Gecko is built in `podman run ... pb-gecko-build`. scripts/build-orca.sh:195-223 runs build-workspace-packages.mjs, rebuild:node, the mobile generators, build:mobile-web, build:orcad and build:web.

**Suggested fix.** Run the libvirt Windows-matrix jobs as a separate runner user and registration, or switch them to qemu:///session, so the user that builds third-party code has no libvirt socket. Move the Orca build (and the Theia yarn build) into the rootless container the way the Gecko build already runs. Prefer just-in-time ephemeral runner registration so that one job cannot leave state for the next.

**Verifier (CONFIRMED, medium).** I traced every cited step.

1. systemd/legion-pb.nix sets pb-runner as the runner user (:40), `ephemeral = false` (:37), `LIBVIRT_DEFAULT_URI = "qemu:///system"` (:48) and `extraGroups = [ "libvirtd" ]` (:55). It also enables libvirtd (:64).

2. The group grants full access. The NixOS libvirtd module on legion's channel sets `auth_unix_rw = "polkit"` (virtualisation/libvirtd.nix:16). Its polkit rule grants org.libvirt.unix.manage to `subject.isInGroup("libvirtd")` (:639). Management access to qemu:///system is root-equivalent: a domain can pass host paths or host block devices through to the guest.

3. The runner sandbox does not block this. github-runner/service.nix:278-315 sets PrivateUsers, ProtectSystem=strict and NoNewPrivileges, but RestrictAddressFamilies includes AF_UNIX. A read-only mount does not stop connect() on a socket. polkit takes the caller's uid and group membership from the host side, not from the job's user namespace. The file's own comment (:27-28) says socket reachability is unverified. The design intends virsh to work for win-matrix-run.sh, and the comment says to add serviceOverrides if it fails. So "it does not work" would be a bug the owner fixes, not a guard.

4. Orca's build runs on the host, outside the container. release.yml build-linux runs on [self-hosted, powerbrowser-release]. The step "Build Orca from source at the pin" runs `bash scripts/fetch-orca.sh` and then `nix develop .#orca --command bash scripts/build-orca.sh` in the runner's host shell, not inside podman. The Gecko build and the packaging steps do use `podman run ... pb-gecko-build`. scripts/build-orca.sh installs with `--ignore-scripts` (:194, :202) and then runs Orca and closure code as pb-runner: config/scripts/build-workspace-packages.mjs (:195), `pnpm run rebuild:node` (:196), the three mobile generators (:206-208), build:mobile-web, build:orcad and build:web (:209-223).

5. Both cited changes are new in v1.7, according to git history: the libvirtd group in fb9fbddc (59-02) and the build-orca step in 071d6f67 (68-01).

6. The pre-job hook and the main-only/dispatch-only checks filter which repo, workflow and event can run a job. They do nothing about code inside the pinned build inputs.

Why medium rather than high:

- The precondition is hard to arrange: an upstream Orca or npm-closure compromise must land in a re-pin, and the re-pin must merge. release-train.yml:1059/1147 arms auto-merge, but main-review and the owner's approving review remain the gate. Some PRs never get auto-merge at all (:1167-1176).
- The main harm in the scenario follows from the precondition alone, without libvirt. Code that runs in the release build as pb-runner can already tamper with the tarball and leave files in the persistent workDir and caches before the hosted signer signs. The libvirt group adds one thing: root on legion.
- The exposure is not limited to Orca. The Theia step (`yarn build` after `yarn install --ignore-scripts`) also runs npm-closure build code in the host shell as pb-runner. The real gap is libvirtd membership for the user that runs all host-shell build steps, not Orca specifically.

No owner decision in DECISIONS.md accepts this risk. D-26 automates weekly re-pins, which increases how often new closure code arrives.

So: CONFIRMED as a real pb-runner-to-root path with a concrete chain, rated as a defence-in-depth gap given the supply-chain precondition. *Checked at:* systemd/legion-pb.nix:55 (libvirtd group), :48 (qemu:///system); NixOS virtualisation/libvirtd.nix:16 + :639 (polkit grants manage to libvirtd group); github-runner/service.nix:305-310 (AF_UNIX allowed); .github/workflows/release.yml build-linux step "Build Orca from source at the pin" (host shell, not podman); scripts/build-orca.sh:195-223

## 63-CR-01: The claude wrapper is never staged in packaged builds, so EXT-02 is silently inert in every shipped artifact

- **Severity:** medium (reviewer label: critical)
- **Verdict:** CONFIRMED
- **Location:** `theia/extensions/orca-agents/src/node/orca-agents-backend-module.ts`
- **Owner decision cited:** D-59

*Section CR-01 of `.planning/workstreams/orca/phases/63-theia-terminals-and-agent-hooks-for-orca/63-REVIEW.md`, verbatim:*

**File:** `theia/extensions/orca-agents/src/node/orca-agents-backend-module.ts:44` (with `powerbrowser/packaging/package-linux.sh:104-117`)
**Issue:** The backend finds the wrapper with `require.resolve('@powerbrowser/orca-agents/bin/claude-wrapper.mjs')`. esbuild does not bundle `require.resolve` (the backend bundle config, `theia/applications/browser/gen-esbuild.node.mjs:43` and `esbuild.mjs:28`, externalizes only `electron` and `better-sqlite3`). At runtime the call therefore walks up from `<GreD>/theia/lib/backend/` looking for `node_modules/@powerbrowser/orca-agents`. `package-linux.sh` stages only `lib/`, `package.json`, `plugins/` and `node_modules/better-sqlite3` under `$STAGE/theia`. The Flatpak repacks that tarball, and `release.yml:339-341` and `package-macos.sh` do the same. No staging line names `orca-agents` or `claude-wrapper.mjs` (`git grep claude-wrapper` outside `.planning` finds only verify scripts and the brand inventory). In every packaged build, Linux included, `require.resolve` throws `MODULE_NOT_FOUND`. The catch at line 49 turns that into one console warning, `launcherPath` stays undefined, the frontend registers no `claudeCode.claudeProcessWrapper` default, and no Claude Code session ever gets an Orca pane or hook status. Linux packaging is the v1.7 deliverable (D-40). 63-04-SUMMARY:247 and 68-CONTEXT P68-42 carried "the wrapper path in packaged builds" forward to Phase 68, but Phase 68 never landed it. The only WINDOWS.md entry (53) covers the Windows launcher twin, not this, so the gap is untracked. Both live rows run the dev tree, so neither can detect it.
**Fix:** Stage the wrapper beside the backend and resolve it there, so the packaged and dev trees use one rule:
```sh
# package-linux.sh (and package-macos.sh, release.yml's windows staging)
mkdir -p "$STAGE/theia/node_modules/@powerbrowser/orca-agents/bin"
cp "$ROOT/theia/extensions/orca-agents/bin/claude-wrapper.mjs" "$STAGE/theia/node_modules/@powerbrowser/orca-agents/bin/"
cp "$ROOT/theia/extensions/orca-agents/package.json" "$STAGE/theia/node_modules/@powerbrowser/orca-agents/"
```
Also add a packaged-tree assertion (an `orca-packaged-tree` clause) that the file is present and resolvable from `theia/lib/backend`. Until both exist, record the gap as an open ledger/WINDOWS entry so the milestone does not close with it unmarked.

## Warnings

**Verifier (CONFIRMED, medium; scope: linux product (packaged tarball/Flatpak/MAR), also macos build and windows build staging; dev tree unaffected).** I traced every step from source on disk.
(1) Line 44 calls require.resolve('@powerbrowser/orca-agents/bin/claude-wrapper.mjs') inside a try block. The catch at lines 49-51 logs a console.warn and leaves launcherPath undefined.
(2) esbuild does not rewrite that call. The built bundle theia/applications/browser/lib/backend/main.js:506348 still holds the literal require.resolve("@powerbrowser/orca-agents/bin/claude-wrapper.mjs"). gen-esbuild.node.mjs (platform node, cjs, external ['electron'], plus 'better-sqlite3' from esbuild.mjs:28) has one copy() asset, Theia's shell-integrations, and it does not copy orca-agents/bin. So the packaged code calls Node's own require.resolve, which searches node_modules folders upward from <GreD>/theia/lib/backend.
(3) package-linux.sh:101-117 stages only lib/, package.json, plugins/ and node_modules/better-sqlite3 under $STAGE/theia. package-macos.sh:379-391 and release.yml:339-341 stage the same set. git grep finds claude-wrapper outside .planning only in the extension's own sources, verify scripts, scripts/lib/orca-offer-scan.mjs and inventory/brand-tokens.json. No packaging step names the wrapper. No NODE_PATH is set in powerbrowser/, the packaging scripts or theia/applications. In the packaged tree no node_modules folder above <GreD>/theia/lib/backend contains @powerbrowser/orca-agents, so require.resolve throws MODULE_NOT_FOUND.
(4) The bridge directory is set in packaged runs (TheiaService passes it, and the package starts Orca since 21898a67), so execution does reach line 44.
(5) The frontend (orca-agents-frontend-module.ts:31-34) calls registerOverride for claudeCode.claudeProcessWrapper only when a path comes back, so in packaged builds no default is registered.
(6) The dev tree works because theia/node_modules/@powerbrowser/orca-agents exists there. That explains why the dev-tree live rows pass.
Counter-evidence I checked:
- verify-orca-packaged-tree.mjs asserts only on Orca's out/orcad tree (node-pty, no Electron). It makes no wrapper or orca-agents assertion.
- verify-orca-packaged-live.mjs never mentions hook, agent or wrapper.
- verify-orca-agent-hooks.mjs and verify-orca-agent-status-live.mjs run from REPO_ROOT, the dev tree.
- WINDOWS 54 is about stopping an orcad left running after a packaged run. WINDOWS 53 is about the Windows .cmd twin. Neither covers this path.
No recorded result contradicts the finding.
Severity: the code path fails in every packaged build. But D-59 (2026-11-18) moved "the EXT-01 live session (plan 60-05) and the extension half of EXT-02" to the next version, and the Claude Code extension is not bundled (plugins/ is git-ignored, and EXT-01 is deferred). So for v1.7 this is a real packaging defect in a deferred feature: a user who installs the Claude Code extension in a packaged build gets no Orca pane or hook status, only a console warning. That puts it at medium, not high.
The finding's claim that the gap is "untracked" is partly wrong. 63-04-SUMMARY:247, STATE.md:173 and 68-CONTEXT P68-42 all name "the wrapper path in packaged builds", and D-59 defers the extension half of EXT-02. It has no WINDOWS or ledger row, though.

## packaging-prefs-network-03: The privacy page says api.anthropic.com is contacted only after an Anthropic API key is added; v1.7 Orca agents send page and repository content to model providers without one

- **Severity:** medium
- **Verdict:** CONFIRMED
- **Location:** `website-staging/privacy.html:77`
- **Owner decision cited:** D-08

**What is wrong.** The 'Hosts contacted only after you use a feature' list ties api.anthropic.com to the Theia AI chat after the user adds an Anthropic API key, and api.openai.com to an OpenAI key. v1.7 ships a pre-installed Claude Agent SDK extension (ORCA_CLAUDE_AGENT_SDK_DIR points orcad at it), and orcad runs the Claude, Codex and other agent CLIs under the user's own sign-ins. The new 'Orca agents and browser tabs' section says the agent 'can read and act on the pages', but never says that the page contents (and repository files) go to the agent's model provider. The page also omits other hosts v1.7 Orca hosting contacts after a user action: Orca's cloud (*.onorca.dev, on the allowlist through D-08), Google favicons (www.google.com/s2/favicons, then t0-t3.gstatic.com), GitHub avatars, and the provider hosts in orcad-server.js (chatgpt.com, auth.x.ai, api.kimi.com, open.bigmodel.cn, and others).

**Scenario.** A user reads the privacy page, adds no API key, and asks an Orca Claude agent to summarise a web page showing their bank statement in an agent tab. The agent sends the page snapshot to api.anthropic.com under the user's Claude subscription sign-in. The privacy page told them that host is contacted only after they add an Anthropic API key, and gave no warning that agent-read page content leaves the machine.

**Preconditions.** The user runs an Orca agent signed in to a provider.

**Evidence.** website-staging/privacy.html:77 `api.anthropic.com: the AI chat feature, after you add an Anthropic API key and send a request.`; :87 `If you run an Orca agent, it can read and act on the pages in the tabs Orca opened for it.` (no statement about where that content goes). powerbrowser/shell/OrcaEnv.sys.mjs:154-166 claudeAgentSdkDir hands orcad the pre-installed SDK. powerbrowser/endpoint-allowlist.json:144 `.onorca.dev` user-initiated, absent from privacy.html. orca/out/orcad/orcad-server.js contains https://api.anthropic.com, https://chatgpt.com, https://api.openai.com, https://auth.x.ai, https://api.kimi.com.

**Suggested fix.** Add a statement to the Orca section that an agent sends what it reads (page contents, files, terminal output) to the AI provider the user signed the agent into. Reword the api.anthropic.com and api.openai.com lines so they also cover Orca agents. List the Orca cloud hosts and the Google favicon and gstatic hosts under 'contacted only after you use a feature'. Derive that list from the allowlist's user-initiated and user-feature rows so the two cannot drift.

**Verifier (CONFIRMED, medium).** website-staging/privacy.html lists api.anthropic.com only as 'the AI chat feature, after you add an Anthropic API key', under the heading 'contacted only when you use the feature that needs them'. The matching allowlist row (endpoint-allowlist.json api.anthropic.com) has the same @theia/ai-anthropic-only justification. v1.7 hands orcad a pre-installed Claude Agent SDK (OrcaEnv.sys.mjs:153-166, claudeAgentSdkDir, used unless the extension is disabled), and Orca agents run under provider sign-ins, not API keys. The 'Orca agents and browser tabs' paragraph says an agent can read the pages in its tabs, but never says that this content goes to the agent's model provider. The page also leaves out the Orca-feature hosts that the allowlist itself records as user-initiated: .onorca.dev and t0-t3.gstatic.com. Whether a particular agent run reaches api.anthropic.com depends on the user's sign-in. The disclosure gap is static and does not depend on that. This is a privacy-disclosure correctness bug with user-visible effect. *Checked at:* website-staging/privacy.html (api.anthropic.com bullet; Orca agents paragraph); powerbrowser/shell/OrcaEnv.sys.mjs:153-166; powerbrowser/endpoint-allowlist.json .onorca.dev and t0..t3.gstatic.com rows, absent from privacy.html

## 68-WR-02: The checkout-path greps treat a grep error as a pass

- **Severity:** warning (not refutation-checked)
- **Verdict:** REPORTED
- **Location:** `powerbrowser/packaging/package-linux.sh`

*Section WR-02 of `.planning/workstreams/orca/phases/68-three-os-artifacts-weekly-re-pin-and-upstream-seams/68-REVIEW.md`, verbatim:*

**File:** `powerbrowser/packaging/package-linux.sh:49-54`; `powerbrowser/packaging/package-macos.sh:268-270,460-462`
**Issue:** `host_root_grep` reads `grep -rlF "$PB_HOST_ROOT/" "$@" 2>/dev/null || true`. Exit status 2 (an unreadable file, a missing target such as a mistyped `$STAGE/orca`, or an I/O error) yields no lines, and the check passes silently. The macOS greps extended in this phase to `$RES/orca` and `$WORK/orca-merged` have the same form. `check-win-sidecar.sh purge` (`:72-75`), the gate these comments cite as the model, states the opposite rule explicitly: "a grep error is a failure, not a pass".
**Fix:**
```bash
host_root_grep() {
    local hits rc=0
    hits="$(grep -rlF -e "$PB_HOST_ROOT/" "$@")" || rc=$?
    [ "$rc" -le 1 ] || fail "grep could not read the stage while looking for $PB_HOST_ROOT/ (exit $rc)"
    [ -z "$hits" ] || fail "the staged tree still carries the host checkout path $PB_HOST_ROOT/: $(head -n1 <<<"$hits")"
}
```
Use the same form at the two macOS sites.

## 60-WR-02: Bundled-extension licence text is read from a copy whose version is never checked against the lock

- **Severity:** warning (not refutation-checked)
- **Verdict:** REPORTED
- **Location:** `scripts/generate-licensing.mjs`

*Section WR-02 of `.planning/workstreams/orca/phases/60-orca-from-source-on-theia-s-node/60-REVIEW.md`, verbatim:*

**File:** `scripts/generate-licensing.mjs:413-417`
**Issue:** For each dependency of a bundled-extensions/*/ extension, `bundledItems` takes `version` and `resolved` from the extension's package-lock.json. It then reads the licence text from the first file that exists among these two:
- `theia/applications/browser/plugins/.user/<id>/extension/node_modules/<dep>/LICENSE.md`
- `orca/node_modules/<dep>/LICENSE.md`

Neither copy's package.json version is compared with `entry.version`. orca/node_modules holds Orca's own dependency, at the version Orca's lockfile pins (orca/package.json:228). That version moves on every Orca re-pin, independently of the extension's lock. The .user copy can also be left over from an earlier theia build. The SDK is 0.3.284 in both places today, so nothing fails now. After the next Orca re-pin that bumps the SDK, THIRD-PARTY-NOTICES.txt would print the newer licence text under the header `@anthropic-ai/claude-agent-sdk 0.3.284`, and `--check` would accept it because it re-derives the same wrong text. The lookup also tries only `LICENSE.md`, so a future carried package that ships `LICENSE` or `LICENSE.txt` falls through to the quote path or fails.
**Fix:** Accept a candidate copy only when its version matches the lock:
```js
const candidates = [join(root, USER_PLUGINS_REL, extId, 'extension', 'node_modules', dep), join(root, 'orca', 'node_modules', dep)];
it.text = candidates
    .filter((d) => readIf(join(d, 'package.json')) !== null && readJson(join(d, 'package.json')).version === entry.version)
    .map((d) => licenceText(d))   // the shared lib reader, not a fixed LICENSE.md name
    .find((t) => t !== null) ?? null;
```

## packaging-prefs-network-06: uBlock Origin is pinned at 1.76.0 with automatic add-on updates off, so its security fixes reach users only through a PowerBrowser release

- **Severity:** low
- **Verdict:** CONFIRMED
- **Location:** `powerbrowser/packaging/bundled-xpi.json:4`

**What is wrong.** The pre-installed uBlock Origin is staged unmodified at the pinned version. extensions.update.autoUpdateDefault=false (branding prefs) means the daily versioncheck-bg check finds a newer AMO version but does not install it, as the v1.7 privacy text confirms. A bundled extension with broad host permissions that runs in every profile therefore keeps any vulnerability until the pin is bumped and a release ships, unless the user updates it by hand.

**Scenario.** A vulnerability in uBlock Origin 1.76.0 (for example in filter parsing) is fixed in 1.76.1 on AMO. Every PowerBrowser profile keeps running 1.76.0 and processes filter lists and pages with the vulnerable code until a new PowerBrowser release bumps bundled-xpi.json.

**Preconditions.** A security fix is published for uBlock Origin after the pin.

**Evidence.** powerbrowser/packaging/bundled-xpi.json: `"version": "1.76.0"`. powerbrowser/branding/*/pref/firefox-branding.js: `pref("extensions.update.autoUpdateDefault", false);`. website-staging/privacy.html:70 `A newer version it finds is not installed automatically.`

**Suggested fix.** Allow automatic updates for uBlock0@raymondhill.net alone (the per-add-on applyBackgroundUpdates setting through a distribution or startup hook), or add a release-train job that bumps the pin when AMO publishes a new signed version.

**Verifier (CONFIRMED, low).** bundled-xpi.json pins uBlock Origin 1.76.0, staged unmodified with no update_url and no ExtensionSettings policy. Both branding pref files set extensions.update.autoUpdateDefault=false (firefox-branding.js:176). AddonManager.shouldAutoUpdate falls back to that default for an add-on whose applyBackgroundUpdates is AUTOUPDATE_DEFAULT, and nothing in powerbrowser/ or patches/ sets that value for uBO. The allowlist versioncheck-bg row and privacy.html confirm that a found update is not installed. A fix therefore reaches users only through a PowerBrowser release or a manual update. The owner chose to disable add-on auto-update for egress reasons. That is accepted risk and does not refute the finding. *Checked at:* powerbrowser/packaging/bundled-xpi.json:4; powerbrowser/branding/release/pref/firefox-branding.js:176; powerbrowser/endpoint-allowlist.json versioncheck-bg.addons.mozilla.org row

## packaging-prefs-network-05: Notices record native executables in the Orca bundle only by their npm package licence, not by what the binaries statically include

- **Severity:** low
- **Verdict:** CONFIRMED
- **Location:** `scripts/lib/orca-shipped-packages.mjs:159`

**What is wrong.** build-orcad.mjs copies the prebuilt agent-browser native executable (an 18 MB Rust binary, agent-browser-linux-x64 and its per-OS siblings) and the ripgrep binary into out/orcad. orca-shipped-packages.mjs records each only as its npm package (agent-browser@0.39.4 Apache-2.0, @vscode/ripgrep-universal MIT) and takes the licence text from the package root. The crates statically linked into the agent-browser binary carry their own notice requirements, and the notices include none of them. ripgrep has its own resources/licenses/ripgrep folder, which is staged but not rendered into THIRD-PARTY-NOTICES.txt.

**Scenario.** The packaged <GreD>/orca/out/orcad/agent-browser-linux-x64 contains statically linked third-party Rust crates (MIT, Apache-2.0 and others). THIRD-PARTY-NOTICES.txt carries only the agent-browser package's own Apache-2.0 text, so the attribution those crates require is missing from the distribution.

**Preconditions.** None.

**Evidence.** scripts/lib/orca-shipped-packages.mjs:159-164 matches `join(ROOT, 'node_modules', '<name>'...)` copies and adds just that package's record. orca/config/scripts/build-orcad.mjs:99 `AGENT_BROWSER_SOURCE = join(ROOT, 'node_modules', 'agent-browser', 'bin', AGENT_BROWSER_NAME)`, :189 copies it into out/orcad. THIRD-PARTY-NOTICES.txt:21441 `agent-browser@0.39.4 (Apache-2.0)` is the only entry.

**Suggested fix.** For each copied native executable, render any third-party licence file the package ships next to the binary, or set ORCAD_OMIT_AGENT_BROWSER=1 if the feature is not needed. Render out/orcad/ripgrep/licenses into the Orca section.

**Verifier (CONFIRMED, low).** build-orcad.mjs:99,188-189 copies the prebuilt agent-browser native binary, an 18 MB file, into out/orcad, and stage_orca ships it. orca-shipped-packages.mjs:159-164 records only the npm package, and THIRD-PARTY-NOTICES.txt:21441 carries only agent-browser@0.39.4 (Apache-2.0). strings on orca/out/orcad/agent-browser-linux-x64 shows about 86 crates.io registry paths (aes, base64, chrono, flate2, and others), so the binary statically includes third-party crates whose notices appear nowhere. The ripgrep half is weaker: build-orcad.mjs:207 copies resources/licenses/ripgrep into out/orcad/ripgrep/licenses, which stage_orca ships as part of out/orcad. Those notices do reach the distribution even though THIRD-PARTY-NOTICES.txt does not render them. The finding therefore holds for agent-browser only. *Checked at:* orca/config/scripts/build-orcad.mjs:99,188-189,207; scripts/lib/orca-shipped-packages.mjs:159-164; THIRD-PARTY-NOTICES.txt:21441; orca/out/orcad/ripgrep/licenses/ (shipped, partly mitigating)

