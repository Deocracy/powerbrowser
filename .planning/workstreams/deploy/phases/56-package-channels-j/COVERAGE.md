# API Coverage — package-channel stores and automation surfaces

> Full coverage by default. Opt-outs are explicit, reasoned decisions.

Scope is the external surface Phase 56's channels rely on. Every INTEGRATE row is
built by plans 56-01 to 56-04 (tracked payload + static row) and exercised by the
owner at plan 56-05. The exceptions are rows marked owner-checkpoint or deferred.

| capability | decision | reason |
|---|---|---|
| Nix flake package outputs (packages + overlays.default) | INTEGRATE | |
| Nix binary cache push (Cachix primary) | INTEGRATE | |
| Nix binary cache push (R2 S3 fallback) | INTEGRATE | |
| Nix binary cache substitute (clean-machine proof, owner checkpoint) | INTEGRATE | |
| Flathub manifest (BaseApp repack + x-checker-data) | INTEGRATE | |
| Flathub external-data-checker version-bump PRs | INTEGRATE | |
| Flathub DNS TXT verification record | INTEGRATE | |
| Flathub submission PR (owner identity) | INTEGRATE | |
| Flathub build-from-source exception request (owner, in writing) | INTEGRATE | |
| winget manifest set (version + installer + locale) | INTEGRATE | |
| wingetcreate update/submit flow | INTEGRATE | |
| winget PR to microsoft/winget-pkgs (fork + PAT) | INTEGRATE | |
| Homebrew tap cask (version + sha256 + livecheck) | INTEGRATE | |
| bot App tap commit (DIST-12 leg) | INTEGRATE | |
| release-train channel-manifests stage (four legs) | INTEGRATE | |
| /download Nix + Flatpak rows (owner paste to Phase 47 site) | INTEGRATE | |
| GitHub Release assets (tarball/DMG/installer URLs + hashes, read-only derivation source) | INTEGRATE | |
| release environment secret WINGET_TOKEN (reference by name only) | INTEGRATE | |
| Cachix/Flathub/winget web dashboards and account settings | OPT-OUT | not needed: owner clicks in the UI; only the replies and URLs are recorded |
| Flathub from-source rebuild | OPT-OUT | not needed yet: only if the exception is denied; named follow-up, not this phase |
| aarch64-darwin package + cask enablement | OPT-OUT | not needed yet: waits on Phase 55 notarization (A3); darwin-deferral markers asserted |
| Windows-asset winget leg going live | OPT-OUT | not needed yet: waits on the Phase 54 asset (A2); fixture honestly marked |
| npm/pip/cargo supply chain | OPT-OUT | explicitly out of scope: no package install in this phase |
