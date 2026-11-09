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
# Not verified until the first job (54 BLOCKED.md item 6): the runner unit's sandboxing may block the
# libvirt socket. If virsh fails only inside a job, set the runner's serviceOverrides and record it.
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
    workDir = "/var/lib/pb-runner";
    extraLabels = [ "powerbrowser-release" ];
    extraPackages = with pkgs; [ git gh nix podman ];
    extraEnvironment = {
      ACTIONS_RUNNER_HOOK_JOB_STARTED = "/etc/pb-runner/legion-pre-job-hook.sh";
      # win-matrix-run.sh calls virsh without -c; for a non-root user that would reach qemu:///session.
      LIBVIRT_DEFAULT_URI = "qemu:///system";
    };
  };
  users.users.pb-runner = {
    isSystemUser = true;
    group = "pb-runner";
    autoSubUidGidRange = true; # rootless podman
    extraGroups = [ "libvirtd" ];
  };
  users.groups.pb-runner = { };
  environment.etc."pb-runner/legion-pre-job-hook.sh" = {
    source = ./pb-runner/legion-pre-job-hook.sh;
    mode = "0555"; # a copy, not a store symlink
  };

  # --- 2. libvirt on legion for pb-runner (54 BLOCKED.md item 6) ---
  virtualisation.libvirtd = {
    enable = true;
    qemu.swtpm.enable = true; # TPM 2.0 for the Windows 11 guest
  };

  # --- 3. Safe Browsing key directory (OWNER-PASS.md section 5 step 3) ---
  # The owner places the key file sb-gapi.data (mode 0440) inside; the runner and chris read it.
  systemd.tmpfiles.rules = [ "d /var/lib/powerbrowser-release 0750 root pb-runner -" ];
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
