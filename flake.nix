{
  description = "PowerBrowser build environment: Theia sidecar + Firefox-ESR fork";

  inputs = {
    nixpkgs.url = "github:NixOS/nixpkgs/nixos-unstable";
  };

  outputs =
    { self, nixpkgs }:
    let
      system = "x86_64-linux";
      pkgs = import nixpkgs { inherit system; };

      # UPD-07 supersedes D-16's Node 22 pin; PITFALLS #7 still holds: one Node
      # version serves the whole sidecar toolchain. nixpkgs' `yarn` is built
      # against the default nodejs and its shebang hard-codes it, so without the
      # override yarn would run every lifecycle script and every node-gyp compile
      # under whatever Node the default is, not the shell's `node`, and native
      # modules built for another MODULE_VERSION fail to load in the backend.
      # Override so yarn itself, and every compile it drives, runs on the pinned Node.
      nodejs = pkgs.nodejs_24;
      yarn = pkgs.yarn.override { inherit nodejs; };

      # PKG-19: the repacked browser is PolyForm Noncommercial, which nixpkgs counts as unfree. Only
      # this package name is allowed here; the devShells keep the plain pkgs above.
      pkgsPowerBrowser = import nixpkgs {
        inherit system;
        config.allowUnfreePredicate = pkg: builtins.elem (nixpkgs.lib.getName pkg) [ "powerbrowser" ];
      };
    in
    {
      devShells.${system} = {
        theia = pkgs.mkShell {
          # stdenv's setup adds `-rpath $out/lib` to every link, and in a dev
          # shell $out is <checkout>/outputs/out, so the drivelist rebuild below
          # would bake the builder's checkout path into drivelist.node (the
          # packaged sidecar ships it; package-linux.sh refuses it, M-6).
          NIX_NO_SELF_RPATH = "1";
          nativeBuildInputs = [
            nodejs
            yarn
            pkgs.python3
            pkgs.pkg-config
            pkgs.gnumake
            # scripts/generate.mjs rasterises brand/mark.svg through the system
            # `inkscape`, so the generator -- and every check that compares its
            # output -- has always depended on a binary no shell declared. It
            # worked on the reference host only because the NixOS system profile
            # happened to provide one. Pinning it here is not just convenience:
            # the tracked PNGs are byte-compared by the generated-identity row,
            # and only inkscape 1.4.4 (what this nixpkgs supplies, and what
            # produced them) reproduces those bytes. A distro package of a
            # different version passes the raster step and fails byte identity.
            pkgs.inkscape
            # zizmor for the AUTO-09 quick row (scripts/verify-zizmor.mjs), 1.29.0 from the locked nixpkgs.
            pkgs.zizmor
          ];
          buildInputs = [
            pkgs.libx11
            pkgs.libxkbfile
          ];
          shellHook = ''
            # drivelist ships no prebuild for 12.0.2, so its install script falls
            # through to `node-gyp rebuild` and the install aborts without one.
            # Use the node-gyp bundled with the pinned Node's npm rather than
            # pkgs.node-gyp, which is built against nixpkgs' default nodejs and would
            # bring a second Node into the toolchain whenever that default is not
            # the pinned one (PITFALLS #7).
            export PATH="${nodejs}/lib/node_modules/npm/bin/node-gyp-bin:$PATH"
            echo "PowerBrowser theia shell ready. Next: cd theia && yarn install && yarn build && yarn start" >&2
          '';
        };

        firefox =
          # `inputsFrom` only copies `nativeBuildInputs`/`buildInputs` from the
          # referenced derivation -- it does NOT copy the derivation's own
          # `stdenv`. `firefox-esr-153-unwrapped` (buildMozillaMach) builds under
          # `buildStdenv = overrideCC llvmPackages.stdenv (...)` -- i.e. clang,
          # not the default gcc `pkgs.mkShell` would otherwise use. Without this
          # override `./mach build` fails immediately with "Could not find
          # clang to generate run bindings for C/C++" even though rustc/cargo/
          # cbindgen are all present and correct. Match the real build's stdenv.
          (pkgs.mkShell.override { stdenv = pkgs.llvmPackages.stdenv; }) {
            inputsFrom = [ pkgs.firefox-esr-153-unwrapped ];
            # D-71: sccache pays for itself in this phase, which repeatedly
            # changes browser/moz.configure -- each change invalidates
            # config.status and cascades into a broad C++ recompile.
            buildInputs = [ pkgs.sccache ];
            shellHook = ''
              # Anchor to the repo root, not invocation-time $PWD: entering the
              # shell from a subdirectory would otherwise scatter build state
              # into that subdirectory instead of the repo-contained path a
              # fresh clone expects. Falls back to $PWD outside a git checkout.
              export MOZBUILD_STATE_PATH="$(git rev-parse --show-toplevel 2>/dev/null || echo "$PWD")/.mozbuild"
              # nixpkgs' bintools-wrapper setup hook exports AS/LD/NM/AR/RANLIB/
              # OBJDUMP/OBJCOPY/READELF/SIZE/STRINGS/STRIP as bare tool names, for
              # classic autotools `./configure` scripts. Firefox's own
              # moz.configure treats a pre-set `AS` env var as an explicit
              # "--with-as"-style override and uses it *without* routing through
              # the C compiler driver -- but flags.configure's `-Wa,--noexecstack`
              # is only valid when passed through the compiler (clang/gcc), not
              # to the raw assembler. The result: "Assembler messages: Fatal
              # error: invalid listing option `,'" on the very first .s file
              # (NSPR's os_Linux_x86_64.s). moz.configure's own toolchain
              # detection (via `inputsFrom`'s clang) is correct on its own;
              # unset these so it is never second-guessed by leftover autotools
              # convenience env vars. CC/CXX stay set (clang/clang++, correct).
              unset AS LD NM AR RANLIB OBJDUMP OBJCOPY READELF SIZE STRINGS STRIP
              # D-71: sccache must see the already-corrected toolchain env
              # above, so this export comes after the unset line, never before.
              export RUSTC_WRAPPER=sccache
              echo "PowerBrowser firefox shell ready. This shell already supplies the full Gecko toolchain (rustc, cargo, cbindgen, clang) -- no separate toolchain setup is needed. Next: scripts/fetch-upstream.sh, then cd upstream && MOZCONFIG=../.mozconfig ./mach build" >&2
            '';
          };

        # Phase 55 (PKG-14): the macOS cross-build shell. Same stdenv override, MOZBUILD anchor and
        # bintools unset line as the firefox shell above, plus the native inputs the macOS steps call.
        firefox-macos =
          (pkgs.mkShell.override { stdenv = pkgs.llvmPackages.stdenv; }) {
            inputsFrom = [ pkgs.firefox-esr-153-unwrapped ];
            nativeBuildInputs = [
              # llvm-lipo is LIPO for unify.py (the two per-target trees) and the sidecar merge (RESEARCH Standard Stack).
              pkgs.llvm
              # lld: the linker option the S7 probe chose for the Darwin cross link; confirm it at the Mac session.
              pkgs.lld
              # rcodesign signs the bundle from Linux (mach macos-sign --use_rcodesign); 0.29.0 per SEC-13.
              pkgs.rcodesign
              # rsync: the Linux DMG branch copies the bundle tree (S7 DMG mechanics).
              pkgs.rsync
              # cmake: listed by the S7 probe for the macOS configure; exercised only by the Mac-side build.
              pkgs.cmake
              # openssl: listed by the S7 probe as a link input for the macOS tool builds.
              pkgs.openssl
              # zlib: listed by the S7 probe as a link input for the macOS tool builds.
              pkgs.zlib
              # gnupatch: listed by the S7 probe; GNU patch for the patch-stack steps.
              pkgs.gnupatch
            ];
            buildInputs = [ pkgs.sccache ];
            shellHook = ''
              export MOZBUILD_STATE_PATH="$(git rev-parse --show-toplevel 2>/dev/null || echo "$PWD")/.mozbuild"
              # The same bintools unset as the firefox shell: see the comment there.
              unset AS LD NM AR RANLIB OBJDUMP OBJCOPY READELF SIZE STRINGS STRIP
              export RUSTC_WRAPPER=sccache
              echo "PowerBrowser firefox-macos shell ready. Cross-build with MOZCONFIG=powerbrowser/packaging/mozconfig-macos-<arch> from the repo root; signing and notarization are owner actions." >&2
            '';
          };
      };

      # PKG-19: the repacked Release tarball. The sidecar takes the same nodejs_24 binding as the shells.
      packages.${system} = {
        powerbrowser = pkgsPowerBrowser.callPackage ./nix/pkg/powerbrowser-bin.nix { inherit nodejs; };
        default = self.packages.${system}.powerbrowser;
      };

      # A consumer's own nixpkgs must allow the unfree name powerbrowser before it evaluates this overlay.
      overlays.default = final: _prev: {
        powerbrowser = final.callPackage ./nix/pkg/powerbrowser-bin.nix { nodejs = final.nodejs_24; };
      };
    };
}
