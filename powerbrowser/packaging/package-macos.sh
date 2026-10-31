#!/usr/bin/env bash
# powerbrowser/packaging/package-macos.sh -- the macOS per-architecture staging (PKG-14, PKG-15).
# One run stages one architecture's application bundle. Run it once per target after the
# per-target Gecko build, then the universal step unifies the two bundles (plan 55-03 owns that step
# and the DMG). It:
#   - runs `./mach package` for the target's mozconfig (its own objdir);
#   - stages the Theia sidecar (lib, package.json, plugins) and the pinned official Node for this
#     architecture under the bundle's Contents/Resources (@RESPATH@ on macOS);
#   - stages the thin better-sqlite3 prebuild that this architecture's Node loads;
#   - refreshes precomplete, because full MARs are made from this directory;
#   - fails before anything is left behind when a pin, a Mach-O check or a checkout-path check fails.
# Usage: bash powerbrowser/packaging/package-macos.sh aarch64|x86_64
# Run from the repo root in the firefox-macos dev shell (nix develop .#firefox-macos) after a Theia
# `yarn build` in theia/ on a matching host. Nothing here needs a Developer ID or an Apple account.
set -euo pipefail
ARCH="${1:-}"
case "$ARCH" in
    aarch64) NODE_KEY=darwin-arm64; NODE_BIN_DIR=darwin-arm64; PREBUILD=darwin-arm64.node ;;
    x86_64)  NODE_KEY=darwin-x64;   NODE_BIN_DIR=darwin-x64;   PREBUILD=darwin-x64.node ;;
    *) echo "package-macos: FAIL -- usage: package-macos.sh aarch64|x86_64 (got '${ARCH}')" >&2; exit 2 ;;
esac
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
OBJ="$ROOT/objdir-macos-$ARCH"
MOZCONFIG_TRACKED="$ROOT/powerbrowser/packaging/mozconfig-macos-$ARCH"
APP="$ROOT/theia/applications/browser"
LIPO="${LIPO:-llvm-lipo}"
fail() { echo "package-macos: FAIL -- $*" >&2; exit 1; }
command -v "$LIPO" >/dev/null || fail "$LIPO not found; enter nix develop .#firefox-macos (llvm supplies llvm-lipo), or set LIPO to a lipo that supports -archs"
test -f "$APP/lib/backend/main.js" || fail "$APP/lib/backend/main.js is absent; run yarn build in theia/ first"

# The target mozconfig expands $MOZ_FETCHES_DIR into the SDK and DMG tool paths when mach loads it.
# Unset, those paths become /MacOSX26.5.sdk and /hfsplus/newfs_hfs, and configure fails later and less
# clearly. Check the inputs here, before the Node download and before the Gecko build.
test -n "${MOZ_FETCHES_DIR:-}" || fail "MOZ_FETCHES_DIR is unset; set it to the directory that holds MacOSX26.5.sdk, hfsplus/ and dmg/ (docs/BUILD.md, macOS section)"
for input in "$MOZ_FETCHES_DIR/MacOSX26.5.sdk" "$MOZ_FETCHES_DIR/hfsplus/newfs_hfs" "$MOZ_FETCHES_DIR/dmg/dmg" "$MOZ_FETCHES_DIR/dmg/hfsplus"; do
    test -e "$input" || fail "$input is absent; MOZ_FETCHES_DIR must hold MacOSX26.5.sdk, hfsplus/newfs_hfs, dmg/dmg and dmg/hfsplus"
done

# The pinned official Node release for this architecture (PKG-15). The sha256 pin in
# node-runtime.json comes from nodejs.org's SHASUMS256.txt. The owner runs the gpg check on that file
# (RELEASING.md "Node provenance"); this script enforces the pin, not the key trust. An archive that
# does not hash to the pin is deleted and the run fails naming it.
PIN="$(python3 -c 'import json,sys; p=json.load(open(sys.argv[1]))[sys.argv[2]]; print(p["version"], p["url"], p["sha256"])' "$ROOT/powerbrowser/packaging/node-runtime.json" "$NODE_KEY")" \
    || fail "no usable $NODE_KEY pin in powerbrowser/packaging/node-runtime.json"
read -r NODE_VERSION NODE_URL NODE_SHA <<< "$PIN" || true
test -n "${NODE_SHA:-}" || fail "no usable $NODE_KEY pin in powerbrowser/packaging/node-runtime.json"
CACHE="$ROOT/.mozbuild/node-dist"; mkdir -p "$CACHE"
ARCHIVE="$CACHE/$(basename "$NODE_URL")"
trap 'rm -f "$ARCHIVE.part"' ERR
if [ ! -f "$ARCHIVE" ]; then
    curl -fsSL -o "$ARCHIVE.part" "$NODE_URL" \
        || { rm -f "$ARCHIVE.part"; fail "downloading $NODE_URL failed"; }
    mv "$ARCHIVE.part" "$ARCHIVE"
fi
echo "$NODE_SHA  $ARCHIVE" | sha256sum -c --quiet - || { rm -f "$ARCHIVE"; fail "$ARCHIVE does not hash to the pin in powerbrowser/packaging/node-runtime.json ($NODE_KEY)"; }

# Release branding is the default, as on Linux: mozconfig.release falls back to the release branding
# directory, while the macOS mozconfigs fall back to dev. Exporting it here makes a bare run stage the
# release brand; a dev build names the dev directory explicitly.
export POWERBROWSER_BRANDING="${POWERBROWSER_BRANDING:-powerbrowser/branding-generated/release}"

# Gecko: the target's own objdir, through its tracked per-target mozconfig.
( cd "$ROOT/upstream" && POWERBROWSER_OBJDIR="objdir-macos-$ARCH" MOZCONFIG="$MOZCONFIG_TRACKED" ./mach package )
# config.status records every configure argument. Fail if the build did not take the selected branding.
grep -qF -- "--with-branding=$POWERBROWSER_BRANDING" "$OBJ/config.status" || fail "$OBJ/config.status does not record --with-branding=$POWERBROWSER_BRANDING; the Gecko build used another branding"

shopt -s nullglob
APPS=( "$OBJ"/dist/*.app )
shopt -u nullglob
test ${#APPS[@]} -eq 1 || fail "expected exactly one staged .app under $OBJ/dist, found ${#APPS[@]}"
BUNDLE="${APPS[0]}"
RES="$BUNDLE/Contents/Resources"
test -f "$RES/precomplete" || fail "$RES/precomplete is absent; the Gecko package did not stage a bundle"

# Theia sidecar: the same files the Linux package stages, under the bundle's Resources directory.
rm -rf "$RES/theia" "$RES/node" "$RES/distribution"
mkdir -p "$RES/theia" "$RES/node/bin" "$RES/distribution"
cp -a "$APP/lib" "$RES/theia/lib"
find "$RES/theia/lib" -name '*.map' -delete
cp "$APP/package.json" "$RES/theia/package.json"
if [ -d "$APP/plugins" ]; then cp -a "$APP/plugins" "$RES/theia/plugins"; fi
# better-sqlite3 stays outside the backend bundle. This architecture's Node loads exactly one
# prebuild, the one named for its platform and arch. The thin slice is staged, because a universal
# merge of two thin trees is the unify step's job (mozpack UnifiedExecutableFile takes thin inputs).
mkdir -p "$RES/theia/node_modules/better-sqlite3/lib" "$RES/theia/node_modules/better-sqlite3/prebuilds"
cp -a "$ROOT/theia/node_modules/better-sqlite3/lib/." "$RES/theia/node_modules/better-sqlite3/lib/"
cp "$ROOT/theia/node_modules/better-sqlite3/package.json" "$RES/theia/node_modules/better-sqlite3/package.json"
cp "$ROOT/theia/node_modules/better-sqlite3/prebuilds/$PREBUILD" "$RES/theia/node_modules/better-sqlite3/prebuilds/$PREBUILD"

# Node for this architecture, from the pinned archive. The tar member names carry the version and
# the os-arch; the staged binary must be a Mach-O of this architecture.
tar -xzf "$ARCHIVE" -C "$RES/node" --strip-components=1 "node-$NODE_VERSION-$NODE_BIN_DIR/bin/node" "node-$NODE_VERSION-$NODE_BIN_DIR/LICENSE"
test -f "$RES/node/bin/node" || fail "the archive carries no node-$NODE_VERSION-$NODE_BIN_DIR/bin/node member"
chmod 755 "$RES/node/bin/node"
case "$ARCH" in
    aarch64) WANT_ARCH=arm64 ;;
    x86_64)  WANT_ARCH=x86_64 ;;
esac
cp "$ROOT/powerbrowser/distribution/policies.json" "$RES/distribution/policies.json"

# No payload carries a Linux name. The darwin pin and the darwin prebuild are the only natives staged.
if find "$RES" \( -name '*linux*' -o -name '*musl*' -o -name '*win32*' \) -print -quit | grep -q .; then
    fail "a non-darwin native is staged under $RES: $(find "$RES" \( -name '*linux*' -o -name '*musl*' -o -name '*win32*' \) -print -quit)"
fi

# Every native payload must be a thin Mach-O of this architecture. The name does not decide it: a
# Linux-built lib/ carries ELF natives under arch-free names (keytar.node, drivelist.node). Each file
# is classified by its first four bytes. ELF fails by name; a Mach-O must report exactly $WANT_ARCH to
# lipo (a fat file lists two arches and fails); a .node or .dylib that is neither fails.
check_payload() {
    local f="$1" magic archs
    magic="$(od -An -N4 -tx1 "$f" 2>/dev/null | tr -d ' \n')"
    case "$magic" in
        7f454c46) fail "$f is an ELF binary, not a Mach-O of $WANT_ARCH (a non-macOS build reached the bundle)" ;;
        cffaedfe|cefaedfe|feedfacf|feedface|cafebabe|bebafeca)
            archs="$("$LIPO" -archs "$f" 2>/dev/null || true)"
            test "$archs" = "$WANT_ARCH" || fail "$f is not a thin $WANT_ARCH Mach-O (lipo reports '${archs:-nothing}')" ;;
        *)
            case "$f" in
                *.node|*.dylib) fail "$f is not a Mach-O of $WANT_ARCH (first bytes '${magic:-empty}')" ;;
            esac ;;
    esac
}
check_payload "$RES/node/bin/node"
check_payload "$RES/theia/node_modules/better-sqlite3/prebuilds/$PREBUILD"
while IFS= read -r payload; do
    check_payload "$payload"
done < <(find "$RES/theia" "$RES/node" -type f \( -name '*.node' -o -name '*.dylib' -o -name '*.so' -o -perm -100 \))

# esbuild's node-file: module keys name the build checkout. The runtime reads them back by exact
# string (the modules are not loaded from those paths), so the whole key is rewritten, as
# package-linux.sh does for the same two bundles. Comments that name the checkout are inert.
for f in "$RES/theia/lib/backend/main.js" "$RES/theia/lib/backend/parcel-watcher.js"; do
    test -f "$f" || fail "$f is absent from the staged sidecar"
done
perl -pi -e 's{//\s*node-file:\S+}{// node-file:<buildhost>}; s{"node-file:[^"]+"}{"node-file:<buildhost>"}g' \
    "$RES/theia/lib/backend/main.js" "$RES/theia/lib/backend/parcel-watcher.js"

# A checkout path must not ship: the staged sidecar and node, and any RUNPATH or bundle map key that
# names the build checkout, fail the run naming the file. RUNPATH rewriting for Mach-O needs the exact
# rpath string from the binary, so it is not guessed here; a hit fails rather than being rewritten.
while IFS= read -r hit; do
    fail "the staged bundle still carries a checkout path: $hit"
done < <(grep -rlF "$ROOT/" "$RES/theia" "$RES/node" 2>/dev/null || true)

# The bundle's precomplete must describe the staged files, because full MARs are made from it.
# createprecomplete.py takes the Mac layout (Contents/Resources/precomplete, walked from the bundle
# root) only when its cwd is named Resources. From the bundle root it writes a stray precomplete at
# X.app/ and leaves the real one stale, so it runs from $RES and both outcomes are checked.
rm -f "$BUNDLE/precomplete"
( cd "$RES" && python3 "$ROOT/upstream/config/createprecomplete.py" )
test ! -e "$BUNDLE/precomplete" || fail "a stray precomplete landed at the bundle root: $BUNDLE/precomplete"
grep -q 'remove "Contents/Resources/theia/' "$RES/precomplete" || fail "$RES/precomplete does not list the staged theia/ files"

trap - ERR
rm -f "$ARCHIVE.part"
echo "package-macos: staged $RES for $ARCH (node $NODE_VERSION, $NODE_KEY pin, prebuild $PREBUILD); the universal unify and DMG steps follow in plan 55-03"
