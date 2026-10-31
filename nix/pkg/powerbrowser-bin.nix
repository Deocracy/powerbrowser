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
  # The flake's Node binding, passed in by flake.nix. It is the sidecar's PATH fallback only (see the wrapper below).
  nodejs,
  # The libraries the binaries link against (DT_NEEDED), which autoPatchelfHook resolves from buildInputs.
  gtk3,
  libx11,
  libxext,
  libdbusmenu-gtk3,
  adwaita-icon-theme,
  xdg-utils,
  # The libraries Gecko loads with dlopen, as nixpkgs' firefox wrapper lists them for x86_64-linux.
  alsa-lib,
  libpulseaudio,
  libxscrnsaver,
  libva,
  libgbm,
  cups,
  udev,
  libnotify,
  ffmpeg_8,
  pciutils,
  vulkan-loader,
  libglvnd,
  speechd-minimal,
  pipewire,
  libkrb5,
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
  # Gecko loads these with dlopen, so their store paths are on no ELF search path unless the wrapper adds them. The list
  # mirrors `libs` in pkgs/applications/networking/browsers/firefox/wrapper.nix of the locked nixpkgs (flake.lock rev
  # ffb3c9b700e759be2ef13237c9d8f953b32a1e46): udev, libva, libgbm, libnotify, libxscrnsaver, cups, pciutils,
  # vulkan-loader, speechd-minimal; pipewire (webrtc), the ffmpeg major that wrapper picks for Firefox 146 and later
  # (ffmpeg_8, because Firefox dlopens libavcodec by its soname), libkrb5 (gssSupport), libglvnd, libpulseaudio and alsa-lib.
  dlopenLibs = [
    udev
    libva
    libgbm
    libnotify
    libxscrnsaver
    cups
    pciutils
    vulkan-loader
    speechd-minimal
    pipewire
    ffmpeg_8
    libkrb5
    libglvnd
    libpulseaudio
    alsa-lib
  ];
  # stdenv.cc.cc.lib is libstdc++, which the Gecko binaries and the staged Node link against.
  runtimeLibs = [
    gtk3
    libx11
    libxext
    libdbusmenu-gtk3
    adwaita-icon-theme
    xdg-utils
    stdenv.cc.cc.lib
  ] ++ dlopenLibs;
  # The same two-directory form the nixpkgs wrapper uses (lib and lib64 of each output).
  dlopenPath = lib.makeLibraryPath dlopenLibs + ":" + lib.makeSearchPathOutput "lib" "lib64" dlopenLibs;
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
  buildInputs = runtimeLibs;

  installPhase = ''
    runHook preInstall

    mkdir -p $out/lib $out/bin
    tar -xJf "$src" -C $out/lib
    test -d $out/lib/powerbrowser || { echo "powerbrowser: the tarball does not unpack to powerbrowser/" >&2; exit 1; }

    # The repacked copy only: one key set, every sibling key left as the tarball wrote it.
    policies=$out/lib/powerbrowser/distribution/policies.json
    jq '.policies.DisableAppUpdate = true' "$policies" > "$policies.tmp"
    mv "$policies.tmp" "$policies"

    # The sidecar runs on the tarball's own staged node/bin/node, which autoPatchelfHook patches with the rest of the ELF
    # files; TheiaService falls back to the first node on PATH only when that file is absent, and nodejs (the flake
    # Node binding) is what the wrapper puts there. LD_LIBRARY_PATH carries the dlopen'd libraries.
    makeWrapper $out/lib/powerbrowser/powerbrowser $out/bin/powerbrowser \
      --prefix PATH : ${lib.makeBinPath [ nodejs ]} \
      --prefix LD_LIBRARY_PATH : ${dlopenPath}

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
