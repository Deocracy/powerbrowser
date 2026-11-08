---
phase: 54-windows-h
plan: 10
gap_closure: true
gap: G-54d (libvirt access Nix block for pb-runner)
status: complete
requirements: [MTX-01]
key-files:
  modified: [.planning/workstreams/deploy/phases/54-windows-h/BLOCKED.md]
commits: [4c2aa1ca]
---

# 54-10 summary: the libvirt block is written for the owner

- BLOCKED.md item 6 holds the following, each option checked with the nixos MCP:
  - `virtualisation.libvirtd.enable` and `qemu.swtpm.enable`;
  - `extraGroups = [ "libvirtd" ]` inside the existing `pb-runner` user block;
  - `LIBVIRT_DEFAULT_URI = "qemu:///system"` in the runner's `extraEnvironment`;
  - the dry-build, `nrs` and `virsh` verification commands.
- `/etc/nixos` was not edited, and this session could not read it.
- Open for the live run: whether the runner unit's sandbox blocks the libvirt socket, and the NixOS firmware paths
  that `pkg-win11-domain.xml` needs.
