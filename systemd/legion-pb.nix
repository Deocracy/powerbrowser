# systemd/legion-pb.nix -- the one /etc/nixos module for legion's Power Browser duties (owner answer
# A11, OWNER-PASS.md section 5): the release runner (49-02), libvirt for the Windows matrix (54-04),
# the Safe Browsing key directory (section 5 step 3) and the Codeberg mirror service and timer (53, GH-04).
#
# Claude never applies this file. The owner installs it:
#   1. pkexec install -D -m 0644 scripts/legion-pre-job-hook.sh /etc/nixos/pb-runner/legion-pre-job-hook.sh
#      (section 5 step 1; the environment.etc entry below reads that copy).
#   2. pkexec install -D -m 0644 systemd/legion-pb.nix /etc/nixos/pb-legion.nix
#   3. In /etc/nixos/configuration.nix, add ./pb-legion.nix to the imports list, and set the runner's
#      repository there (the brand scan admits the release repository slug only in the files
#      inventory/brand-tokens.json lists, so this file does not carry it):
#        services.github-runners.powerbrowser-release.url = "https://github.com/<owner>/<repo>";
#      <owner>/<repo> is the github.com path in configuration.toml [urls] release_notes. The option
#      has no default, so evaluation fails while the line is missing.
#   4. Before the rebuild, run the root commands of 53 BLOCKED.md item 2 step 2 (the mirror-push
#      credential file and the bare mirror repository); until they exist the daily mirror start fails.
#   5. Section 5 step 4: nixos-rebuild dry-build, mint the one-time registration token into
#      /var/lib/secrets/github-runner-registration, then nrs.
#
# No secret value is in this file. The registration token file, the Codeberg push credential and the
# Safe Browsing key file sb-gapi.data are named by path only; the owner's root commands create them.
#
# Every option name was checked with the nixos MCP (unstable; 26.05 is not indexed there) and against
# legion's own 26.05 channel; the list is in
# .planning/workstreams/orca/phases/59-carry-forward-from-v1-5-and-v1-6/59-02-SUMMARY.md.
#
# The runner's sandbox (59-CR-02) was read from the github-runner module of legion's nixos-26.05
# channel (service.nix) and from the podman calls in .github/workflows/release.yml (podman build
# --pull=always, podman run -v ... with no --network, so podman 5's default rootless network, pasta).
# It is not tested: the first deployment of this file is the proof. The legion-runner-unit row
# derives the module's hardening defaults from that service.nix and requires each default that
# blocks rootless podman to be overridden, and every override to be one of them. If a podman step
# still fails inside a job, the next candidates, kept at the module default because nothing shown
# here needs them, are ProtectControlGroups (cgroup writes), ProtectProc (hidepid on /proc) and
# PrivateMounts; relax one at a time and record which one was needed.
#
# The security trade, stated plainly. Compared with the module default, build code running on this
# runner can now create unprivileged user, mount and network namespaces (the usual starting point
# for kernel privilege-escalation exploits); run host setuid programs, which keep CAP_SETUID and
# CAP_SETGID through the bounding set; create setuid files; see host files and processes under their
# real uids (no PrivateUsers); and see the full /dev tree (opening a device is still limited to the
# pseudo devices, /dev/fuse and /dev/net/tun by the device allow list). With ProtectKernelTunables off,
# /proc/sys, /sys, /proc/sysrq-trigger and the other kernel-variable paths are no longer read-only
# and /proc/kallsyms and /proc/kcore are no longer hidden. A procfs sysctl write is checked against
# the writer's euid and the file's mode bits, not against a capability, so a job that compromises a
# host setuid-root program gets euid 0 and can write the root-owned 0644 sysctls. Nothing here opens a direct
# path to the registration token (still InaccessiblePaths) or to /home (still ProtectHome). This is
# the price of running rootless podman under this unit, and it is why third-party build code (the
# agent server's npm closure in particular) should run inside the container or off this host.
{ config, pkgs, lib, ... }:
let
  # Rootless podman looks up newuidmap and newgidmap on PATH, and the runner's PATH holds only its
  # extraPackages, so the first release run on this runner failed with 'exec: "newuidmap":
  # executable file not found in $PATH' (2026-11-26). The two setuid wrappers NixOS installs in
  # /run/wrappers/bin are linked here by absolute path; a store copy of shadow's binaries would not
  # be setuid.
  uidmapWrappers = pkgs.runCommand "pb-runner-uidmap-wrappers" { } ''
    mkdir -p $out/bin
    ln -s /run/wrappers/bin/newuidmap /run/wrappers/bin/newgidmap $out/bin/
  '';
in
{
  # --- 1. The release runner (docs/RELEASING.md "Runner registration through the /etc/nixos flow") ---
  services.github-runners.powerbrowser-release = {
    enable = true;
    # url is set in configuration.nix (step 3 above).
    tokenFile = "/var/lib/secrets/github-runner-registration";
    tokenType = "registration";
    ephemeral = false; # ephemeral with a registration token fails on restart
    replace = true;
    name = "legion";
    user = "pb-runner";
    group = "pb-runner";
    # The module bind-mounts and chdirs into this path without a "-" prefix and never creates it, and
    # it deletes everything inside it on every start; the tmpfiles rule in section 3 creates it.
    workDir = "/var/lib/pb-runner";
    extraLabels = [ "powerbrowser-release" ];
    extraPackages = with pkgs; [ git gh nix podman uidmapWrappers ];
    extraEnvironment = {
      ACTIONS_RUNNER_HOOK_JOB_STARTED = "/etc/pb-runner/legion-pre-job-hook.sh";
      # The module sets HOME to workDir, which it wipes on every start. Rootless podman keeps its image
      # store under XDG_DATA_HOME, so the store lives outside workDir and survives a restart.
      XDG_DATA_HOME = "/var/lib/pb-runner-data";
    };
    # 59-CR-02: release.yml runs rootless `podman build` and `podman run` on this runner. Each module
    # default below blocks rootless podman, so it is relaxed for this runner only, with the reason.
    # Where the module merges a list (mkBefore), the override uses lib.mkForce: serviceOverrides is
    # merged into the module's serviceConfig, and a plain list would be appended to the module's.
    serviceOverrides = {
      RestrictNamespaces = false; # podman creates user, mount, network, UTS, IPC and PID namespaces
      PrivateUsers = false; # newuidmap maps pb-runner's subordinate ranges, which a private user namespace lacks
      NoNewPrivileges = false; # newuidmap and newgidmap are setuid wrappers in /run/wrappers
      # The module's empty bounding set leaves the setuid helpers euid 0 with no capability, and
      # writing a multi-range uid_map or gid_map needs CAP_SETUID or CAP_SETGID. Nothing else is added.
      CapabilityBoundingSet = lib.mkForce [ "CAP_SETUID CAP_SETGID" ];
      PrivateDevices = false; # the private /dev has no /dev/fuse (fuse-overlayfs) and no /dev/net/tun (pasta)
      # ProtectClock implies DeviceAllow=char-rtc r, and a non-empty allow list closes every other
      # device, so the two devices rootless podman opens are allowed explicitly ("" first resets).
      # UNSURE, settled on first deployment: "/dev/fuse rw" is probably unneeded on kernel 6.18, where
      # rootless podman uses native overlay, and it lets jobs mount FUSE file systems. Run
      #   sudo -u pb-runner env XDG_DATA_HOME=/var/lib/pb-runner-data podman info --format '{{.Store.GraphDriverName}} {{.Store.GraphOptions}}'
      # and drop the entry if no mount_program is reported.
      DeviceAllow = lib.mkForce [
        ""
        "/dev/fuse rw"
        "/dev/net/tun rw"
      ];
      RestrictSUIDSGID = false; # image layers carry setuid files, which unpacking must recreate
      # "private": sethostname is allowed but changes only the unit's own UTS namespace (systemd 260,
      # systemd.exec(5)); crun calls it inside the container's UTS namespace.
      ProtectHostname = "private";
      # Both leave locked read-only or inaccessible over-mounts under /proc (/proc/sys, /proc/kmsg and
      # others); the kernel refuses the fresh procfs mount crun makes in the container's user
      # namespace while the existing /proc is covered that way.
      ProtectKernelTunables = false;
      ProtectKernelLogs = false;
      # The module's mkBefore deny list minus ~@mount (mount, pivot_root), ~capset (crun drops
      # capabilities) and ~sethostname (crun names the container); every other entry is kept, and
      # ~syslog is added back because ProtectKernelLogs=false drops the syslog(2) filter it installs.
      SystemCallFilter = lib.mkForce [
        "~@clock"
        "~@cpu-emulation"
        "~@module"
        "~@obsolete"
        "~@raw-io"
        "~@reboot"
        "~setdomainname"
        "~syslog"
      ];
      # UNSURE, settled on first deployment: cgroups are not delegated to this unit (no Delegate=,
      # ProtectControlGroups stays true, no user session), so podman falls back to cgroupfs. Confirm
      # with a job step `podman run --rm docker.io/library/debian:bookworm true` on this runner.
      # ProtectSystem=strict leaves /var/lib read-only; the podman store must be writable.
      ReadWritePaths = [ "/var/lib/pb-runner-data" ];
    };
  };
  # podman reads /etc/containers/policy.json and registries.conf, and the runner's HOME is the wiped
  # workDir, so they come from the system. This NixOS option writes /etc/containers/{containers.conf,
  # storage.conf,registries.conf,policy.json} (nixos/modules/virtualisation/containers.nix; policy.json
  # is skopeo's default policy). One search registry lets the Containerfile's short-name
  # FROM debian:bookworm@sha256:... resolve without the prompt podman needs when there are several.
  virtualisation.containers = {
    enable = true;
    registries.search = [ "docker.io" ];
  };
  users.users.pb-runner = {
    isSystemUser = true;
    group = "pb-runner";
    autoSubUidGidRange = true; # rootless podman
    # packaging-prefs-network-01: no libvirtd group. Management access to qemu:///system is
    # root-equivalent, and this user runs the release build's third-party build code (the npm
    # closures of the sidecar and the agent server) in the host shell. No workflow job uses libvirt;
    # the Windows matrix (scripts/matrix/win-matrix-run.sh) is not run by this user.
  };
  users.groups.pb-runner = { };
  environment.etc."pb-runner/legion-pre-job-hook.sh" = {
    source = ./pb-runner/legion-pre-job-hook.sh;
    mode = "0555"; # a copy, not a store symlink
  };

  # --- 2. libvirt on legion for the Windows matrix (54 BLOCKED.md item 6) ---
  # The runner user is not in the libvirtd group, so no runner job reaches qemu:///system.
  # win-matrix-run.sh calls virsh without -c, which reaches qemu:///session for a non-root user, so
  # whoever runs it sets LIBVIRT_DEFAULT_URI=qemu:///system.
  virtualisation.libvirtd = {
    enable = true;
    qemu.swtpm.enable = true; # TPM 2.0 for the Windows 11 guest
  };

  # --- 3. Directories: the Safe Browsing key directory (OWNER-PASS.md section 5 step 3), and the
  # runner's work directory and podman store (59-CR-01, 59-CR-02) ---
  # The owner places the key file sb-gapi.data (mode 0440) in the first; the runner and chris read it.
  systemd.tmpfiles.rules = [
    "d /var/lib/powerbrowser-release 0750 root pb-runner -"
    "d /var/lib/pb-runner 0750 pb-runner pb-runner -"
    "d /var/lib/pb-runner-data 0700 pb-runner pb-runner -"
  ];
  users.users.chris.extraGroups = [ "pb-runner" ];

  # --- 4. Codeberg mirror: systemd/codeberg-mirror.service and .timer, directive for directive ---
  # The one change: git comes from this system's nixpkgs, not /run/current-system/sw/bin, so the
  # unit does not depend on git being in environment.systemPackages.
  systemd.services.codeberg-mirror = {
    description = "Push git heads and tags to the Codeberg mirror";
    wants = [ "network-online.target" ];
    after = [ "network-online.target" ];
    environment = {
      HOME = "/var/lib/codeberg-mirror";
      GIT_HTTP_LOW_SPEED_LIMIT = "1000";
      GIT_HTTP_LOW_SPEED_TIME = "60";
    };
    serviceConfig = {
      Type = "oneshot";
      DynamicUser = true;
      StateDirectory = "codeberg-mirror";
      WorkingDirectory = "/var/lib/codeberg-mirror/powerbrowser.git";
      TimeoutStartSec = "15min";
      LoadCredential = "mirror-push:/etc/codeberg-mirror/mirror-push";
      ExecStartPre = [
        "${pkgs.git}/bin/git fetch --prune origin '+refs/heads/*:refs/heads/*' '+refs/tags/*:refs/tags/*'"
        "${pkgs.git}/bin/git show-ref --verify --quiet refs/heads/main"
      ];
      # Never forced and never pruning: git refuses a non-fast-forward update.
      ExecStart = "${pkgs.git}/bin/git push codeberg 'refs/heads/*:refs/heads/*' 'refs/tags/*:refs/tags/*'";
      NoNewPrivileges = true;
      ProtectSystem = "strict";
      ProtectHome = true;
      PrivateTmp = true;
      PrivateDevices = true;
      ProtectKernelTunables = true;
      ProtectKernelModules = true;
      ProtectControlGroups = true;
      RestrictSUIDSGID = true;
      LockPersonality = true;
      UMask = "0077";
      CapabilityBoundingSet = "";
      RestrictAddressFamilies = "AF_INET AF_INET6 AF_UNIX";
    };
  };
  systemd.timers.codeberg-mirror = {
    description = "Daily push to the Codeberg mirror";
    wantedBy = [ "timers.target" ];
    timerConfig = {
      OnCalendar = "daily";
      Persistent = true;
      RandomizedDelaySec = "15m";
    };
  };
}
