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
# channel (service.nix), not tested: the first deployment of this file is the proof. If a podman step
# still fails inside a job, the options the module keeps at its defaults and that are the next
# candidates are ProtectControlGroups (cgroup writes) and ProtectKernelTunables (sysfs inside the
# container); relax one at a time and record which one was needed.
{ config, pkgs, lib, ... }:
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
    extraPackages = with pkgs; [ git gh nix podman ];
    extraEnvironment = {
      ACTIONS_RUNNER_HOOK_JOB_STARTED = "/etc/pb-runner/legion-pre-job-hook.sh";
      # The module sets HOME to workDir, which it wipes on every start. Rootless podman keeps its image
      # store under XDG_DATA_HOME, so the store lives outside workDir and survives a restart.
      XDG_DATA_HOME = "/var/lib/pb-runner-data";
    };
    # 59-CR-02: release.yml runs rootless `podman build` and `podman run` on this runner. The module's
    # mkDefault hardening forbids what rootless podman needs, so each setting below is relaxed for
    # this runner only, with the reason.
    serviceOverrides = {
      RestrictNamespaces = false; # podman creates user, mount, UTS, IPC and PID namespaces
      PrivateUsers = false; # newuidmap must map pb-runner's subordinate uid and gid ranges
      NoNewPrivileges = false; # newuidmap and newgidmap are setuid wrappers in /run/wrappers
      PrivateMounts = false; # the container's mounts are made in its own mount namespace
      PrivateDevices = false; # fuse-overlayfs needs /dev/fuse when native rootless overlay is absent
      RestrictSUIDSGID = false; # image layers carry setuid files, which unpacking must recreate
      ProtectHostname = false; # crun sets the container's hostname inside its UTS namespace
      ProtectProc = "default"; # a fresh /proc in the container is refused while /proc is hidepid
      # serviceOverrides is merged into the module's serviceConfig, so a plain list would be appended
      # to the module's mkBefore deny list and leave ~@mount, ~capset and ~sethostname in force.
      # mkForce replaces that list; this keeps every other entry of it.
      SystemCallFilter = lib.mkForce [
        "~@clock"
        "~@cpu-emulation"
        "~@module"
        "~@obsolete"
        "~@raw-io"
        "~@reboot"
      ];
      # ProtectSystem=strict leaves /var/lib read-only; the podman store must be writable.
      ReadWritePaths = [ "/var/lib/pb-runner-data" ];
    };
  };
  users.users.pb-runner = {
    isSystemUser = true;
    group = "pb-runner";
    autoSubUidGidRange = true; # rootless podman
    # packaging-prefs-network-01: no libvirtd group. Management access to qemu:///system is
    # root-equivalent, and this user runs the release build's third-party build code (Orca's and
    # Theia's npm closures) in the host shell. No workflow job uses libvirt: the Windows matrix
    # (scripts/matrix/win-matrix-run.sh) is run by the owner from the owner's own account.
  };
  users.groups.pb-runner = { };
  environment.etc."pb-runner/legion-pre-job-hook.sh" = {
    source = ./pb-runner/legion-pre-job-hook.sh;
    mode = "0555"; # a copy, not a store symlink
  };

  # --- 2. libvirt on legion for the owner's Windows matrix run (54 BLOCKED.md item 6) ---
  # The owner runs the matrix as their own account, which is in the libvirtd group, with
  # LIBVIRT_DEFAULT_URI=qemu:///system (virsh without -c reaches qemu:///session for a non-root user).
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
