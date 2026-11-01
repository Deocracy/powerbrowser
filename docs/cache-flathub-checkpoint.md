# Cache and Flathub checkpoint

Tracked text for the owner. Nothing in this file is executed by the tree. Every account action,
every message and every submission is an owner step, listed under the one owner-steps section
below. The owner records each reply in that section, verbatim, with its date.

## Dry-run commands (no live action, safe to run)

1. Print the cache configuration as the tree derives it:

       node -p 'JSON.stringify(require("./nix/cache.json"), null, 2)'

2. Check the cache and the Flathub manifest rows:

       scripts/verify-platform.sh --only binary-cache
       scripts/verify-platform.sh --only flathub-manifest

3. Parse the Flathub manifest as JSON:

       node -e 'JSON.parse(require("fs").readFileSync("flatpak/org.debios.PowerBrowser.json", "utf8"))'

4. Check that the manifest still derives from the release, with the placeholder refused:

       node scripts/verify-flathub-manifest.mjs --release

   The row refuses the placeholder verification token until the owner sets it.

5. Flathub verifies the domain of the app ID, not the homepage host. For `org.debios.PowerBrowser` that is
   `debios.org`, so the TXT record name is `_flathub.debios.org`; the alternative is to serve the token at
   `https://debios.org/.well-known/org.flathub.VerifiedApps.txt`. The value is the token the Flathub Developer
   Portal shows once the submission is accepted and you have collaborator access (docs.flathub.org, "Verification",
   read on 2026-10-31). It is written into `x-flathub-verification.token` only after that step. The foundation
   must control `debios.org` for the app ID to verify; confirm that before the submission (owner-verify).

## Owner steps (not executed in this tree)

### Cachix licence request (owner sends)

Subject: Open-source plan eligibility for a public Nix binary cache

    Hello,

    I maintain PowerBrowser, a browser platform distributed under the PolyForm Noncommercial
    1.0.0 licence. The project is at https://powerbrowser.org.

    I would like to host a public binary cache named "powerbrowser" for the project's Nix
    package. Is the project eligible for the free open-source plan? If it is not, the cache
    will be served from an S3-compatible bucket instead.

    Thank you.

Owner reply (record verbatim, with the date): ____

### R2 fallback enablement (owner, if Cachix refuses or needs a payment method)

1. Create the bucket named `powerbrowser-nix-cache` in the Cloudflare account. Enable a public
   read host for it, a host name with no path, and write that host into `nix/cache.json`
   `r2.substituter` and into the `interface.substituters` entry that carries `@R2_PUBLIC_HOST@`.
2. Create the signing key pair outside the tree:

       nix-store --generate-binary-cache-key powerbrowser-nix-cache-1 <secret-key-file> <public-key-file>

   Keep the secret-key file in the owner's store. Write only the public key into
   `nix/cache.json` `r2.publicKey` and `interface.trustedKeys`.
3. Create the object-write token for the bucket. Store it in the release environment. Its
   `docs/RENEWALS.md` row already exists.
4. Run `node scripts/verify-binary-cache.mjs --release`. It is green when no placeholder is left.

### Flathub linter exception (owner writes and sends)

Subject: Linter exception request for org.debios.PowerBrowser

    Hello,

    I maintain org.debios.PowerBrowser, a browser built upstream by Mozilla's Firefox ESR
    release process and distributed as a prebuilt tarball. The Flatpak repacks that tarball on
    the org.freedesktop.Platform runtime with the org.mozilla.firefox.BaseApp base and does not
    rebuild the browser from source.

    I request a written exception for the prebuilt-tarball linter rule for this application,
    with the reason above. The tarball, its hash and its source revision are published on the
    release page: https://github.com/@RELEASE_REPO@/releases.

    If the exception is refused, the application will be submitted as a from-source manifest
    in a later change. That manifest is a named follow-up and is not part of this submission.

    Thank you.

The linter-exception file entry, for the flatpak-builder-lint exceptions file, names the
application and the stable branch with the reason text. The owner submits it under the owner's
own identity.

Owner reply (record verbatim, with the date): ____

### Flathub submission (owner, under the owner's identity, after the written reply)

1. Render the release tokens into a scratch directory outside the checkout, once the hash record
   holds the real digest (the render refuses the placeholder):

       node scripts/verify-flathub-manifest.mjs --render <scratch-dir>/org.debios.PowerBrowser.json

   Then open the submission pull request with the rendered manifest and the desktop and icon files.
2. Set `x-flathub-verification.token` to the value the Flathub Developer Portal shows after the DNS TXT record
   `_flathub.debios.org` (or the well-known file on `debios.org`) is in place, then run `node scripts/verify-flathub-manifest.mjs --release`.
3. Change `x-source-exception.status` only after the written reply is recorded above. Until then
   the value stays `pending-owner-reply`.

### Clean-machine substitute proof (owner, after the release is published)

1. On a clean machine with the live cache configured, run `nix build .#powerbrowser`.
2. Paste the substitute log, verbatim, into the 56-05 evidence.

### Flatpak sandbox grants (for the Flathub reviewer)

The manifest grants `--socket=fallback-x11` beside `--socket=wayland` (X11 only when no Wayland session exists),
`--socket=pulseaudio`, `--device=dri`, `--share=ipc`, `--share=network` and `--persist=.debios`. It grants no
filesystem and no bus name; the flathub-manifest row compares `finish-args` with that list as a set. With
`--share=network` the sidecar's loopback listener is reachable by other processes of the host and by other
network-sharing Flatpaks, so its per-session token is the only barrier. That is the design, and it is stated here
so the reviewer sees it.
