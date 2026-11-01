#!/usr/bin/env bash
# powerbrowser/packaging/package-macos.sh -- the macOS per-architecture staging (PKG-14, PKG-15).
# Two modes. `aarch64` or `x86_64` stages one architecture's application bundle: run it once per
# target after the per-target Gecko build. `universal` then unifies the two staged bundles, merges the
# darwin sidecar with lipo, signs ad hoc, and writes the DMG, the complete MAR and both Darwin
# descriptors (plan 55-03; see universal() below). The per-architecture mode:
#   - checks its inputs (lipo, MOZ_FETCHES_DIR and its SDK and DMG tools, the Theia build, the pinned
#     Node pin) before anything is downloaded or built;
#   - runs `./mach package` for the target's mozconfig (its own objdir), and checks that configure
#     recorded the selected branding (release by default, as package-linux.sh does);
#   - stages the Theia sidecar, the pinned official Node for this architecture and the thin
#     better-sqlite3 prebuild into a COPY of the staged .app, under Contents/Resources;
#   - rewrites the esbuild node-file: keys, then checks that every native payload is a thin Mach-O of
#     this architecture, that no Linux name is staged, and that no checkout path ships;
#   - refreshes precomplete from Contents/Resources, because full MARs are made from it;
#   - replaces the objdir's .app with the copy only when every check has passed. A failed run leaves
#     the .app exactly as mach wrote it, and removes its own working copy.
# Usage: bash powerbrowser/packaging/package-macos.sh aarch64|x86_64|universal
# Run from the repo root in the firefox-macos dev shell (nix develop .#firefox-macos) after a Theia
# `yarn build` in theia/ on a matching host. Nothing here needs a Developer ID or an Apple account.
set -euo pipefail
ARCH="${1:-}"
# One row per target: its Node pin key and archive directory, its better-sqlite3 prebuild name, and
# the arch name lipo reports. The universal mode reads the same rows through arch_row.
arch_row() {
    case "$1" in
        aarch64) NODE_KEY=darwin-arm64; NODE_BIN_DIR=darwin-arm64; PREBUILD=darwin-arm64.node; WANT_ARCH=arm64 ;;
        x86_64)  NODE_KEY=darwin-x64;   NODE_BIN_DIR=darwin-x64;   PREBUILD=darwin-x64.node;   WANT_ARCH=x86_64 ;;
        *) return 1 ;;
    esac
}
UNIFY_ORDER="x86_64 aarch64" # unify.sh order: x86_64 is app1 (merged into), aarch64 is app2
if [ "$ARCH" != universal ] && ! arch_row "$ARCH"; then
    echo "package-macos: FAIL -- usage: package-macos.sh aarch64|x86_64|universal (got '${ARCH}')" >&2; exit 2
fi
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
OBJ="$ROOT/objdir-macos-$ARCH"
MOZCONFIG_TRACKED="$ROOT/powerbrowser/packaging/mozconfig-macos-$ARCH"
APP="$ROOT/theia/applications/browser"
LIPO="${LIPO:-llvm-lipo}"
fail() { echo "package-macos: FAIL -- $*" >&2; exit 1; }
command -v "$LIPO" >/dev/null || fail "$LIPO not found; enter nix develop .#firefox-macos (llvm supplies llvm-lipo), or set LIPO to a lipo that supports -archs"

# The target mozconfig expands $MOZ_FETCHES_DIR into the SDK and DMG tool paths when mach loads it.
# Unset, those paths become /MacOSX26.5.sdk and /hfsplus/newfs_hfs, and configure fails later and less
# clearly. Check the inputs here, before the Node download and before the Gecko build.
test -n "${MOZ_FETCHES_DIR:-}" || fail "MOZ_FETCHES_DIR is unset; set it to the directory that holds MacOSX26.5.sdk, hfsplus/ and dmg/ (docs/BUILD.md, macOS section)"
for input in "$MOZ_FETCHES_DIR/MacOSX26.5.sdk" "$MOZ_FETCHES_DIR/hfsplus/newfs_hfs" "$MOZ_FETCHES_DIR/dmg/dmg" "$MOZ_FETCHES_DIR/dmg/hfsplus"; do
    test -e "$input" || fail "$input is absent; MOZ_FETCHES_DIR must hold MacOSX26.5.sdk, hfsplus/newfs_hfs, dmg/dmg and dmg/hfsplus"
done

# Every exit removes a partial download and this run's working copy, so a failure leaves nothing.
WORK=""
ARCHIVE=""
cleanup() {
    if [ -n "$ARCHIVE" ]; then rm -f "$ARCHIVE.part"; fi
    if [ -n "$WORK" ]; then rm -rf "$WORK"; fi
}
trap cleanup EXIT

# The pinned official Node release for one architecture (PKG-15). The sha256 pin in
# node-runtime.json comes from nodejs.org's SHASUMS256.txt. The owner runs the gpg check on that file
# (RELEASING.md "Node provenance"); this script enforces the pin, not the key trust. An archive that
# does not hash to the pin is deleted and the run fails naming it. Sets NODE_VERSION and ARCHIVE.
fetch_pin() {
    local key="$1" pin url sha
    pin="$(python3 -c 'import json,sys; p=json.load(open(sys.argv[1]))[sys.argv[2]]; print(p["version"], p["url"], p["sha256"])' "$ROOT/powerbrowser/packaging/node-runtime.json" "$key")" \
        || fail "no usable $key pin in powerbrowser/packaging/node-runtime.json"
    read -r NODE_VERSION url sha <<< "$pin" || true
    test -n "${sha:-}" || fail "no usable $key pin in powerbrowser/packaging/node-runtime.json"
    mkdir -p "$ROOT/.mozbuild/node-dist"
    ARCHIVE="$ROOT/.mozbuild/node-dist/$(basename "$url")"
    if [ ! -f "$ARCHIVE" ]; then
        curl -fsSL -o "$ARCHIVE.part" "$url" || fail "downloading $url failed"
        mv "$ARCHIVE.part" "$ARCHIVE"
    fi
    echo "$sha  $ARCHIVE" | sha256sum -c --quiet - || { rm -f "$ARCHIVE"; fail "$ARCHIVE does not hash to the pin in powerbrowser/packaging/node-runtime.json ($key)"; }
}

# thin, fat, elf or other, from the first four bytes.
magic_kind() {
    case "$(od -An -N4 -tx1 "$1" 2>/dev/null | tr -d ' \n')" in
        cffaedfe|cefaedfe|feedfacf|feedface) echo thin ;;
        cafebabe|bebafeca) echo fat ;;
        7f454c46) echo elf ;;
        *) echo other ;;
    esac
}

# --- universal: one bundle from the two per-target bundles (PKG-14, PKG-15) ----------------------
# Run after `package-macos.sh aarch64` and `package-macos.sh x86_64`. Each per-target bundle carries its
# own thin sidecar, from the Theia build of a matching host. The steps:
#   1. copy both bundles and lift each sidecar (Contents/Resources/theia and node) out of its copy;
#   2. re-check each staged node against its pin (byte equality with the pinned archive member);
#   3. unify the Gecko halves with upstream unify.py in unify.sh order. unify.py refuses a file found in
#      one tree only, and the two better-sqlite3 prebuilds carry different names, which is why the
#      sidecar is merged here and not by unify;
#   4. merge each sidecar pair with lipo create: every thin Mach-O pair (.node, rg, node) becomes one fat
#      file; every other file must be byte-identical in both trees; the prebuild pair becomes one fat
#      file staged under both names, because the loader picks prebuilds/<platform>-<arch>.node;
#   5. delete absolute LC_RPATH entries (the Mach-O form of the RUNPATH removal in package-linux.sh),
#      assert every native is universal (no ELF, no thin slice), run the package-target-natives row on
#      the merged sidecar, and refuse any file that names this checkout;
#   6. stage the merged sidecar under Contents/Resources (MOZ_PKG_RESPATH, the macOS GreD), refresh
#      precomplete, sign ad hoc with ./mach macos-sign --use_rcodesign (developer entitlements, no p12:
#      the Developer ID path is Task 2 of plan 55-03 and waits on the owner's Team ID);
#   7. write the DMG through mozbuild.action.make_dmg (the is_linux branch of dmg.py, with the package
#      arguments configure recorded), the complete MAR through make_full_update.sh, and one descriptor
#      per Darwin target through the shared buildUpdateXml;
#   8. replace .mozbuild/macos-package/ with the new evidence and run the macos-package-payload row.
# Nothing here needs a Developer ID, an Apple account or a network read beyond the pinned Node archives.
universal() {
    local OTOOL="${OTOOL:-llvm-otool}" INSTALL_NAME_TOOL="${INSTALL_NAME_TOOL:-llvm-install-name-tool}"
    local tool arch bundles appname="" res f rel a x archs want=""
    for tool in "$OTOOL" "$INSTALL_NAME_TOOL" rcodesign rsync; do
        command -v "$tool" >/dev/null || fail "$tool not found; enter nix develop .#firefox-macos"
    done
    export POWERBROWSER_BRANDING="${POWERBROWSER_BRANDING:-powerbrowser/branding-generated/release}"
    mkdir -p "$ROOT/.mozbuild"
    WORK="$(mktemp -d "$ROOT/.mozbuild/.pkg-macos-universal.XXXXXX")"
    local EV="$WORK/evidence" A="$WORK/sidecar-aarch64" X="$WORK/sidecar-x86_64"
    local SQ=theia/node_modules/better-sqlite3/prebuilds
    mkdir -p "$EV"
    # x86_64 is app1 and holds the objdir that runs mach for every step below.
    local MACH_ENV=(POWERBROWSER_OBJDIR=objdir-macos-x86_64 MOZCONFIG="$ROOT/powerbrowser/packaging/mozconfig-macos-x86_64")

    # 1 and 2: copy, lift the sidecar, re-check the pin, record the per-target evidence.
    for arch in $UNIFY_ORDER; do
        arch_row "$arch"
        want="$want $WANT_ARCH"
        shopt -s nullglob
        bundles=( "$ROOT/objdir-macos-$arch"/dist/*.app )
        shopt -u nullglob
        test ${#bundles[@]} -eq 1 || fail "expected exactly one staged .app under objdir-macos-$arch/dist, found ${#bundles[@]}; run package-macos.sh $arch first"
        test -z "$appname" || test "$(basename "${bundles[0]}")" = "$appname" || fail "the two per-target bundles are named $appname and $(basename "${bundles[0]}"); both targets must use one branding"
        appname="$(basename "${bundles[0]}")"
        mkdir -p "$WORK/$arch" "$WORK/sidecar-$arch"
        cp -a "${bundles[0]}" "$WORK/$arch/"
        res="$WORK/$arch/$appname/Contents/Resources"
        test -d "$res/theia" && test -f "$res/node/bin/node" || fail "${bundles[0]} carries no staged sidecar; run package-macos.sh $arch first"
        mv "$res/theia" "$res/node" "$WORK/sidecar-$arch/"
        fetch_pin "$NODE_KEY"
        mkdir -p "$WORK/pin-$arch"
        tar -xzf "$ARCHIVE" -C "$WORK/pin-$arch" --strip-components=1 "node-$NODE_VERSION-$NODE_BIN_DIR/bin/node" \
            || fail "the $NODE_KEY archive carries no node-$NODE_VERSION-$NODE_BIN_DIR/bin/node member"
        cmp -s "$WORK/pin-$arch/bin/node" "$WORK/sidecar-$arch/node/bin/node" \
            || fail "the node staged in ${bundles[0]} is not node $NODE_VERSION from the $NODE_KEY pin; rerun package-macos.sh $arch"
        cp "$res/application.ini" "$EV/application-$arch.ini"
        cp "$ROOT/objdir-macos-$arch/config.status" "$EV/config.status-$arch"
    done
    # unify.py refuses differing application.ini files; say why before it does.
    local id_x id_a
    id_x="$(sed -n 's/^BuildID=//p' "$EV/application-x86_64.ini")"
    id_a="$(sed -n 's/^BuildID=//p' "$EV/application-aarch64.ini")"
    test -n "$id_x" && test "$id_x" = "$id_a" \
        || fail "the per-target BuildIDs differ (x86_64 '$id_x', aarch64 '$id_a'); both targets must be built with one build date before they can unify"

    # 3: the Gecko halves, in unify.sh order.
    local UNI="$WORK/x86_64/$appname"
    ( cd "$ROOT/upstream" && env "${MACH_ENV[@]}" ./mach python toolkit/mozapps/installer/unify.py "$UNI" "$WORK/aarch64/$appname" ) \
        || fail "unify.py refused the two per-target bundles (its output is above); a differing non-binary file means the two trees were not built from one source"

    # 5 (first half): an absolute rpath names a build host and makes the loader search it first.
    while IFS= read -r -d '' f; do
        [ "$(magic_kind "$f")" = thin ] || continue
        while IFS= read -r rel; do
            case "$rel" in
                /*) "$INSTALL_NAME_TOOL" -delete_rpath "$rel" "$f" || fail "could not delete the rpath $rel from $f" ;;
            esac
        done < <("$OTOOL" -l "$f" | awk '$1 == "cmd" { r = ($2 == "LC_RPATH") } r && $1 == "path" { sub(/^ *path /, ""); sub(/ \(offset [0-9]+\)$/, ""); print; r = 0 }')
    done < <(find "$A" "$X" -type f -print0)

    # 4: merge. The prebuild pair first, because its two names differ.
    test -f "$A/$SQ/darwin-arm64.node" && test -f "$X/$SQ/darwin-x64.node" || fail "a per-target sidecar lacks its better-sqlite3 prebuild under $SQ"
    "$LIPO" -create "$A/$SQ/darwin-arm64.node" "$X/$SQ/darwin-x64.node" -output "$WORK/better-sqlite3.node" \
        || fail "lipo could not merge the two better-sqlite3 prebuilds"
    rm -f "${A:?}/${SQ:?}/darwin-arm64.node" "${X:?}/${SQ:?}/darwin-x64.node"
    if ! diff <(cd "$A" && find . ! -type d | LC_ALL=C sort) <(cd "$X" && find . ! -type d | LC_ALL=C sort) > "$WORK/paths.diff"; then
        fail "the two sidecar trees carry different files, and a file found in one tree only cannot be merged: $(grep '^[<>]' "$WORK/paths.diff" | head -5 | tr '\n' ' ')"
    fi
    while IFS= read -r -d '' rel; do
        a="$A/$rel"; x="$X/$rel"
        if [ "$(magic_kind "$a")" = thin ] && [ "$(magic_kind "$x")" = thin ]; then
            "$LIPO" -create "$a" "$x" -output "$a.universal" || fail "lipo could not merge the pair ${rel#./}"
            chmod --reference="$a" "$a.universal"
            mv "$a.universal" "$a"
        elif ! cmp -s "$a" "$x"; then
            fail "${rel#./} differs between the two sidecar trees and is not a thin Mach-O pair lipo can merge"
        fi
    done < <(cd "$A" && find . -type f -print0)
    cp "$WORK/better-sqlite3.node" "$A/$SQ/darwin-arm64.node"
    cp "$WORK/better-sqlite3.node" "$A/$SQ/darwin-x64.node"

    # 5 (second half): every native is universal, whatever its name says.
    want="$(tr ' ' '\n' <<< "$want" | sed '/^$/d' | LC_ALL=C sort | xargs)"
    while IFS= read -r f; do
        case "$(magic_kind "$f")" in
            fat)
                archs="$("$LIPO" -archs "$f" 2>/dev/null | tr ' ' '\n' | sed '/^$/d' | LC_ALL=C sort | xargs)"
                test "$archs" = "$want" || fail "$f is not Mach-O universal ($want); lipo reports '${archs:-nothing}'" ;;
            elf) fail "$f is an ELF binary under a darwin name (a non-macOS build reached the sidecar)" ;;
            *) fail "$f is named as a native but is not Mach-O universal ($want)" ;;
        esac
    done < <(find "$A" -type f \( -name '*.node' -o -name '*.dylib' -o -name rg -o -name node \))
    node "$ROOT/scripts/verify-package-target-natives.mjs" --target macos --stage "$A" \
        || fail "the package-target-natives row refused the merged sidecar (its output is above)"
    if [ "$(uname -s)" = Darwin ]; then
        test "$("$A/node/bin/node" --version)" = "$NODE_VERSION" || fail "the merged node does not report $NODE_VERSION"
    fi
    while IFS= read -r f; do
        fail "the merged sidecar still carries a checkout path: $f"
    done < <(grep -rlF "$ROOT/" "$A" 2>/dev/null || true)

    # 6: stage, refresh precomplete, sign ad hoc.
    mv "$A/theia" "$A/node" "$UNI/Contents/Resources/"
    rm -f "${UNI:?}/precomplete"
    ( cd "$UNI/Contents/Resources" && python3 "$ROOT/upstream/config/createprecomplete.py" )
    test ! -e "$UNI/precomplete" || fail "a stray precomplete landed at the bundle root: $UNI/precomplete"
    grep -q 'remove "Contents/Resources/theia/' "$UNI/Contents/Resources/precomplete" || fail "the unified precomplete does not list the staged theia/ files"
    ( cd "$ROOT/upstream" && env "${MACH_ENV[@]}" ./mach macos-sign --use_rcodesign -e developer -a "$UNI" ) \
        || fail "ad-hoc signing of the unified bundle failed (its output is above)"

    # 7: names from the tree, then the DMG, the MAR and the descriptors.
    local names app version tag marchannel token
    names="$(cd "$ROOT" && node --input-type=module -e '
        import { deriveChannel, MACOS_TOKEN } from "./scripts/lib/channel-identity.mjs";
        import { resolveConfig, updateChannel } from "./scripts/generate.mjs";
        const { facts, failures } = deriveChannel(process.cwd());
        if (!facts) { console.error(failures.join("\n")); process.exit(1); }
        const { config } = resolveConfig("configuration.toml");
        console.log(facts.app, facts.version, facts.releaseKey, updateChannel(config).marChannelId, MACOS_TOKEN);
    ')" || fail "the release names could not be derived from configuration.toml (the output above names the key)"
    read -r app version tag marchannel token <<< "$names"
    local DMG_NAME="$app-$version.$token.dmg" MAR_NAME="$app-$version.$token.complete.mar"
    cp -a "$UNI" "$EV/"
    mkdir -p "$WORK/dmg-src"
    cp -a "$UNI" "$WORK/dmg-src/"
    ( cd "$ROOT/upstream" && env "${MACH_ENV[@]}" ./mach python -c '
import shlex, sys
import buildconfig
from mozbuild.action import make_dmg
sys.exit(make_dmg.main(shlex.split(buildconfig.substs.get("MOZ_PACKAGE_EXTRA_ARGS", "")) + sys.argv[1:]))
' "$WORK/dmg-src" "$EV/$DMG_NAME" ) || fail "make_dmg failed on the unified bundle (its output is above)"
    local pversion
    pversion="$(sed -n 's/^Version=//p' "$UNI/Contents/Resources/application.ini" | head -n 1)"
    ( cd "$ROOT/upstream" && MAR="$ROOT/objdir-macos-x86_64/dist/host/bin/mar" MOZ_PRODUCT_VERSION="$pversion" MAR_CHANNEL_ID="$marchannel" \
        bash tools/update-packaging/make_full_update.sh "$EV/$MAR_NAME" "$UNI" ) || fail "make_full_update.sh failed on the unified bundle (its output is above)"
    # One descriptor per derived Darwin target, through the shared emitter. The patch URL takes the form
    # build-update-xml.mjs step 5 documents (<mar_origin>/<tag>/<asset>), so a host change in
    # configuration.toml is absorbed there (assumption A1). shortcut: build-update-xml.mjs still lists
    # Darwin as PENDING; call it instead once it takes the Darwin rows (Phase 50, assumption A2).
    ( cd "$ROOT" && node --input-type=module -e '
        import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
        import { join } from "node:path";
        import { buildUpdateXml } from "./scripts/verify-mar-update-hop.mjs";
        import { deriveTargets } from "./scripts/verify-macos-package-payload.mjs";
        import { UPDATE_CHANNEL, marOrigin, resolveConfig } from "./scripts/generate.mjs";
        const [ev, ini, mar, tag, display] = process.argv.slice(1);
        const { config } = resolveConfig("configuration.toml");
        const origin = marOrigin(config);
        if (!origin) { console.error("configuration.toml [urls] mar_origin is unset, so the patch URL has no host"); process.exit(1); }
        const text = readFileSync(ini, "utf8");
        const field = k => new RegExp(`^${k}=(\\S+)`, "m").exec(text)?.[1];
        const xml = buildUpdateXml({ marBytes: readFileSync(join(ev, mar)), marUrl: `${origin}/${tag}/${mar}`,
            appVersion: field("Version"), platformVersion: field("MaxVersion"), buildID: field("BuildID"),
            displayVersion: display, detailsURL: config.urls?.release_notes });
        for (const t of deriveTargets(process.cwd(), rel => readFileSync(rel, "utf8"))) {
            mkdirSync(join(ev, "update", UPDATE_CHANNEL, t.token), { recursive: true });
            writeFileSync(join(ev, "update", UPDATE_CHANNEL, t.token, "update.xml"), xml);
        }
    ' "$EV" "$UNI/Contents/Resources/application.ini" "$MAR_NAME" "$tag" "$version" ) || fail "the Darwin descriptors could not be emitted (the output above names the input)"

    # 8: replace the evidence, then let the row judge it.
    rm -rf "${ROOT:?}/.mozbuild/macos-package"
    mv "$EV" "$ROOT/.mozbuild/macos-package"
    node "$ROOT/scripts/verify-macos-package-payload.mjs" || fail "the macos-package-payload row refused the new evidence (its output is above)"
    echo "package-macos: wrote .mozbuild/macos-package/ ($appname, $DMG_NAME, $MAR_NAME, BuildID $id_x); signed ad hoc, not notarized"
}

if [ "$ARCH" = universal ]; then
    universal
    exit 0
fi

test -f "$APP/lib/backend/main.js" || fail "$APP/lib/backend/main.js is absent; run yarn build in theia/ first"
test -f "$ROOT/theia/node_modules/better-sqlite3/prebuilds/$PREBUILD" || fail "$ROOT/theia/node_modules/better-sqlite3/prebuilds/$PREBUILD is absent; run yarn install in theia/ first"
fetch_pin "$NODE_KEY"

# Release branding is the default, as in package-linux.sh: mozconfig.release falls back to the release branding
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
test -f "$BUNDLE/Contents/Resources/precomplete" || fail "$BUNDLE/Contents/Resources/precomplete is absent; the Gecko package did not stage a bundle"

# Stage into a copy of the whole .app. createprecomplete.py walks the bundle from two levels above its
# cwd, so the copy must be a complete bundle. The objdir's .app is replaced only after every check passes.
WORK="$(mktemp -d "$OBJ/.pkg-macos-$ARCH.XXXXXX")"
STAGED="$WORK/$(basename "$BUNDLE")"
cp -a "$BUNDLE" "$STAGED"
RES="$STAGED/Contents/Resources"

# Theia sidecar: the same files package-linux.sh stages, under the bundle's Resources directory.
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
# the os-arch; the staged binary must be a Mach-O of this architecture (checked below).
tar -xzf "$ARCHIVE" -C "$RES/node" --strip-components=1 "node-$NODE_VERSION-$NODE_BIN_DIR/bin/node" "node-$NODE_VERSION-$NODE_BIN_DIR/LICENSE" \
    || fail "the archive carries no node-$NODE_VERSION-$NODE_BIN_DIR/bin/node member"
test -f "$RES/node/bin/node" || fail "the archive carries no node-$NODE_VERSION-$NODE_BIN_DIR/bin/node member"
chmod 755 "$RES/node/bin/node"
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
rm -f "$STAGED/precomplete"
( cd "$RES" && python3 "$ROOT/upstream/config/createprecomplete.py" )
test ! -e "$STAGED/precomplete" || fail "a stray precomplete landed at the bundle root: $STAGED/precomplete"
grep -q 'remove "Contents/Resources/theia/' "$RES/precomplete" || fail "$RES/precomplete does not list the staged theia/ files"

# Every check passed. Replace the objdir's .app with the staged copy. The previous .app moves into the
# working directory first, so a failed move puts it back.
mv "$BUNDLE" "$WORK/previous.app"
if ! mv "$STAGED" "$BUNDLE"; then
    mv "$WORK/previous.app" "$BUNDLE"
    fail "could not move the staged bundle into $BUNDLE; the previous bundle is restored"
fi
echo "package-macos: staged $BUNDLE/Contents/Resources for $ARCH (node $NODE_VERSION, $NODE_KEY pin, prebuild $PREBUILD, branding $POWERBROWSER_BRANDING); run package-macos.sh universal after both targets"
