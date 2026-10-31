# PKG-19: the published Release tarball repacked as a Nix package. The derivation builds nothing:
# it fetches the tarball, patches its ELF files against the Nix store, wraps the launcher and installs
# the desktop entry and icons. Every version, URL and name derives at eval time from the generator's
# tracked outputs (powerbrowser/packaging/version/release.txt and configuration.toml). The one hash is
# the record nix/pkg/release-hash.json, which the DIST-12 bot PR rewrites per release.
#
# DisableAppUpdate is merged into this repacked copy of policies.json only. The release tarball keeps
# its own copy without the key; scripts/verify-policies-update-split.mjs compares both sides.
{
  lib,
  stdenv,
  fetchurl,
  autoPatchelfHook,
  makeWrapper,
  copyDesktopItems,
  jq,
  # The flake's Node binding, passed in by flake.nix. The sidecar never takes a second Node.
  nodejs,
  # The Gecko runtime set, as nixpkgs' firefox wrapper lists it for x86_64-linux.
  gtk3,
  alsa-lib,
  libpulseaudio,
  libx11,
  libxext,
  libxscrnsaver,
  libva,
  libgbm,
  cups,
  udev,
  libnotify,
  ffmpeg_7,
  pciutils,
  vulkan-loader,
  libglvnd,
  libdbusmenu-gtk3,
  speechd-minimal,
  adwaita-icon-theme,
  xdg-utils,
}:

let
  manifest = builtins.fromTOML (builtins.readFile ../../configuration.toml);
  # The release key the generator emitted (v<ESR>-<revision>); scripts/verify-release-identity.mjs
  # keeps this file equal to releaseIdentity().
  releaseKey = lib.removeSuffix "\n" (builtins.readFile ../../powerbrowser/packaging/version/release.txt);
  version = lib.removePrefix "v" releaseKey;
  app = manifest.identity.app_basename;
  # owner/repo of the Release home, read from [urls] release_notes.
  repo = lib.removeSuffix "/releases" (lib.removePrefix "https://github.com/" manifest.urls.release_notes);
  # The Linux target token (docs/RELEASING.md asset table); flake-repack asserts it equals that table.
  targetToken = "linux-x86_64";
  tarball = "${app}-${version}.${targetToken}.tar.xz";
  hashRecord = builtins.fromJSON (builtins.readFile ../../nix/pkg/release-hash.json);
  checkedHash =
    if hashRecord.releaseKey == releaseKey then
      hashRecord.sha256
    else
      throw "release-hash.json is for ${hashRecord.releaseKey} but the release is ${releaseKey}: the DIST-12 bot PR (channel-manifests.yml flake-hash-pr) must write the hash for this key first";
  runtimeLibs = [
    gtk3
    alsa-lib
    libpulseaudio
    libx11
    libxext
    libxscrnsaver
    libva
    libgbm
    cups
    udev
    libnotify
    ffmpeg_7
    pciutils
    vulkan-loader
    libglvnd
    libdbusmenu-gtk3
    speechd-minimal
    adwaita-icon-theme
    xdg-utils
  ];
in
stdenv.mkDerivation {
  pname = "powerbrowser";
  inherit version;

  src = fetchurl {
    url = "https://github.com/${repo}/releases/download/${releaseKey}/${tarball}";
    hash = checkedHash;
  };

  # The tarball is unpacked by hand into $out/lib, so the default unpack phase is skipped.
  dontUnpack = true;
  dontBuild = true;
  dontConfigure = true;

  nativeBuildInputs = [
    autoPatchelfHook
    makeWrapper
    copyDesktopItems
    jq
  ];
  buildInputs = runtimeLibs ++ [ nodejs ];

  installPhase = ''
    runHook preInstall

    mkdir -p $out/lib $out/bin
    tar -xJf "$src" -C $out/lib
    test -d $out/lib/powerbrowser || { echo "powerbrowser: the tarball does not unpack to powerbrowser/" >&2; exit 1; }

    # The repacked copy only: one key set, every sibling key left as the tarball wrote it.
    policies=$out/lib/powerbrowser/distribution/policies.json
    jq '.policies.DisableAppUpdate = true' "$policies" > "$policies.tmp"
    mv "$policies.tmp" "$policies"

    makeWrapper $out/lib/powerbrowser/powerbrowser $out/bin/powerbrowser \
      --prefix PATH : ${lib.makeBinPath [ nodejs ]}

    # The tracked release desktop entry, with its checkout-root placeholders rewritten to the store paths.
    desktop=$out/share/applications/powerbrowser.desktop
    install -Dm644 ${../../powerbrowser/powerbrowser-release.desktop} "$desktop"
    sed -i -e '/^#/d' -e 's|^Exec=.*/bin/powerbrowser %u$|Exec=powerbrowser %u|' -e 's|^Icon=.*$|Icon=powerbrowser|' "$desktop"
    grep -qx 'Exec=powerbrowser %u' "$desktop" && grep -qx 'Icon=powerbrowser' "$desktop" && ! grep -q '@POWERBROWSER_REPO_ROOT@' "$desktop" \
      || { echo "powerbrowser: the desktop entry rewrite did not apply" >&2; exit 1; }
    for size in 16 32 48 64 128; do
      install -Dm644 ${../../powerbrowser/branding/release}/default$size.png \
        $out/share/icons/hicolor/''${size}x''${size}/apps/powerbrowser.png
    done

    runHook postInstall
  '';

  meta = {
    description = "PowerBrowser: a Gecko browser shell hosting a Theia sidecar as its default GUI";
    homepage = manifest.product.homepage;
    # The license text is LICENSING.md at the release root; nixpkgs has no PolyForm entry.
    license = {
      fullName = "PolyForm Noncommercial 1.0.0";
      url = "https://polyformproject.org/licenses/noncommercial/1.0.0/";
      free = false;
      redistributable = true;
    };
    mainProgram = "powerbrowser";
    platforms = [ "x86_64-linux" ];
  };
}
