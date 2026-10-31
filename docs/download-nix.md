# Install PowerBrowser with Nix

PowerBrowser is available as a Nix package for 64-bit Linux. Nix installs the prebuilt browser, so nothing is compiled on your machine.

To install it into your profile, run:

    nix profile add github:@RELEASE_REPO@#powerbrowser

To update to the newest release, run:

    nix profile upgrade powerbrowser

Nix keeps the previous version until you upgrade, so you can return to it with `nix profile rollback`.

When PowerBrowser publishes a download cache for Nix, Nix asks whether to trust the project's settings the first time you use it. Answer yes, or add `--accept-flake-config` to the command, so the package comes from the cache. Until then, Nix downloads the prebuilt browser directly.
