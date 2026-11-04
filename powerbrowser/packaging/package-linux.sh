#!/usr/bin/env bash
# powerbrowser/packaging/package-linux.sh -- the Linux package (NG-063, NG-072).
# Runs `./mach package`, then:
#   - stages the Theia sidecar, the pinned official Node release (R13) and
#     distribution/policies.json into the packaged app dir;
#   - refreshes precomplete, because full MARs are made from this dir;
#   - rewrites the tarball mach wrote, then makes the complete MAR from the same dir.
# It packages the RELEASE objdir: the one the release mozconfig builds into
# (MOZ_OBJDIR default, read by scripts/lib/release-objdir.mjs), and it passes the
# release mozconfig to mach, so `mach package` cannot reach the dev objdir/.
# The dev tree is never touched.
# Run from the repo root after a release Gecko build and a Theia `yarn build`:
#   bash powerbrowser/packaging/package-linux.sh   (inside pb-gecko-build, DSH-BLOCKED.md step 4)
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
OBJ="$ROOT/$(node "$ROOT/scripts/lib/release-objdir.mjs")"
APP="$ROOT/theia/applications/browser"
fail() { echo "package-linux: FAIL -- $*" >&2; exit 1; }
test -f "$APP/lib/backend/main.js" || fail "$APP/lib/backend/main.js is absent; run yarn build in theia/ first"

# The pinned official Node release (R13), downloaded once into the git-ignored .mozbuild/.
# Its release-key provenance: the sha256 pin in powerbrowser/packaging/node-runtime.json
# comes from nodejs.org's SHASUMS256.txt, verified by the operator against the Node
# release signing keys (`gpg --verify SHASUMS256.txt`; RELEASING.md "Node provenance"
# names the step as key trust the owner performs). The script below cannot perform
# that check -- it has no keyring here -- so it enforces what it can: the pin.
# A download that does not hash to the pin is deleted and the run fails naming it,
# so an unverified archive is never unpacked into the package.
read -r NODE_VERSION NODE_URL NODE_SHA < <(python3 -c 'import json,sys; p=json.load(open(sys.argv[1]))["linux-x64"]; print(p["version"], p["url"], p["sha256"])' "$ROOT/powerbrowser/packaging/node-runtime.json")
CACHE="$ROOT/.mozbuild/node-dist"; mkdir -p "$CACHE"
ARCHIVE="$CACHE/$(basename "$NODE_URL")"
# M3: never leave a partial download or a partial tarball behind on failure.
TARBALL=""
trap 'rm -f "$ARCHIVE.part" ${TARBALL:+$TARBALL.tmp}' ERR
if [ ! -f "$ARCHIVE" ]; then
    curl -fsSL -o "$ARCHIVE.part" "$NODE_URL" \
        || { rm -f "$ARCHIVE.part"; fail "downloading $NODE_URL failed"; }
    mv "$ARCHIVE.part" "$ARCHIVE"
fi
echo "$NODE_SHA  $ARCHIVE" | sha256sum -c --quiet - || { rm -f "$ARCHIVE"; fail "$ARCHIVE does not hash to the pin in powerbrowser/packaging/node-runtime.json"; }

( cd "$ROOT/upstream" && MOZCONFIG="$ROOT/powerbrowser/packaging/mozconfig.release" ./mach package )

VERSION="$(sed -n 's/^Version=//p' "$OBJ/dist/bin/application.ini")"
STAGE="$(find "$OBJ/dist" -mindepth 1 -maxdepth 1 -type d -newer "$OBJ/dist/bin/application.ini" -exec test -f '{}/precomplete' \; -print | head -n 1)"
test -n "$STAGE" || { echo "package-linux: FAIL -- no staged app dir with a precomplete under $OBJ/dist" >&2; exit 1; }
rm -rf "$STAGE/theia" "$STAGE/node"
mkdir -p "$STAGE/theia" "$STAGE/node/bin" "$STAGE/distribution"
cp -a "$APP/lib" "$STAGE/theia/lib"
find "$STAGE/theia/lib" -name '*.map' -delete
cp "$APP/package.json" "$STAGE/theia/package.json"
if [ -d "$APP/plugins" ]; then cp -a "$APP/plugins" "$STAGE/theia/plugins"; fi
# F7: better-sqlite3 stays outside the backend bundle (esbuild external in
# theia/applications/browser/esbuild.mjs), so the packaged backend carries the
# real package's runtime files: its JS wrapper plus the one linux-x64 prebuilt
# binding. Node resolution walks up from lib/backend, so node_modules/ beside
# lib/ resolves require('better-sqlite3') the same way theia/node_modules/
# does for a dev run.
mkdir -p "$STAGE/theia/node_modules/better-sqlite3/lib" "$STAGE/theia/node_modules/better-sqlite3/prebuilds"
cp -a "$ROOT/theia/node_modules/better-sqlite3/lib/." "$STAGE/theia/node_modules/better-sqlite3/lib/"
cp "$ROOT/theia/node_modules/better-sqlite3/package.json" "$STAGE/theia/node_modules/better-sqlite3/package.json"
cp "$ROOT/theia/node_modules/better-sqlite3/prebuilds/linux-x64.node" "$STAGE/theia/node_modules/better-sqlite3/prebuilds/linux-x64.node"
tar -xJf "$ARCHIVE" -C "$STAGE/node" --strip-components=1 "node-$NODE_VERSION-linux-x64/bin/node" "node-$NODE_VERSION-linux-x64/LICENSE"
test "$("$STAGE/node/bin/node" --version)" = "$NODE_VERSION" || fail "the staged node does not report $NODE_VERSION"
cp "$ROOT/powerbrowser/distribution/policies.json" "$STAGE/distribution/policies.json"
# M-6: no checkout path ships in the sidecar. Two sources, both build-host-only:
# native .node files carry a RUNPATH naming the checkout's build dir, and the
# backend bundles carry esbuild `node-file:` module keys and comments naming
# node_modules source paths. Neither is a load path (the modules load
# ./native/*.node), but the RUNPATH makes the loader search a user-writable
# checkout dir first on any host where that path exists, and both expose the
# builder's checkout path. The keys are bundle map keys the runtime reads by
# exact string, so the whole key is rewritten -- never a partial prefix that
# could collide -- and the comments are inert.
# patchelf is in the firefox dev shell this script runs in (and in the
# release container). PKG-22 (Phase 45): the strip covers the row's full ELF
# universe, not only the natives glob -- every staged ELF under theia/ and
# node/ (Gecko libs included once the container build stages them) -- because
# the portable-elf row walks the whole extracted tarball. Per-file `|| true`
# keeps one unreadable file from failing staging; the row (not the loop's
# silence) is the verdict. Idempotent: --remove-rpath on an already-clean ELF
# is a no-op, so re-running staging prints the same tree.
while IFS= read -r staged_elf; do
    patchelf --remove-rpath "$staged_elf" 2>/dev/null || true
done < <(find "$STAGE/theia" "$STAGE/node" -type f 2>/dev/null || true)
perl -pi -e 's{//\s*node-file:\S+}{// node-file:<buildhost>}; s{"node-file:[^"]+"}{"node-file:<buildhost>"}g' \
    "$STAGE/theia/lib/backend/main.js" "$STAGE/theia/lib/backend/parcel-watcher.js"
# ng063-style assertion: no staged file under theia/ or node/ may still carry
# the checkout path (here: the running checkout at package time). A missed file
# fails the run naming it, before precomplete is refreshed. The pattern is the
# checkout prefix, not bare /home/: third-party sources legitimately contain
# strings like "/home/" + user or "/home/.theia" that name no builder path.
while IFS= read -r hit; do
    fail "the staged sidecar still carries a checkout path: $hit"
done < <(grep -rlF "$ROOT/" "$STAGE/theia" "$STAGE/node" 2>/dev/null || true)
( cd "$STAGE" && python3 "$ROOT/upstream/config/createprecomplete.py" )

# PKG-21 (Phase 45): the release manifest beside the rewritten tarball --
# built version, release key, update and MAR channel ids, producing
# tree/host/toolchain attribution per the BUILD.md rule -- so the MAR
# measurement weighs an attributed artifact. Values derive at package time
# (application.ini, configuration.toml via the generator); nothing typed.
{
    RELEASE_KEY="$(node --input-type=module -e "import { resolveConfig, releaseIdentity } from '$ROOT/scripts/generate.mjs'; const { config } = resolveConfig('$ROOT/configuration.toml'); console.log(releaseIdentity(config).releaseKey);")"
    CHANNEL="$(node --input-type=module -e "import { resolveConfig, updateChannel } from '$ROOT/scripts/generate.mjs'; const { config } = resolveConfig('$ROOT/configuration.toml'); console.log(updateChannel(config).channel);")"
    MAR_CHANNEL="$(node --input-type=module -e "import { resolveConfig, updateChannel } from '$ROOT/scripts/generate.mjs'; const { config } = resolveConfig('$ROOT/configuration.toml'); console.log(updateChannel(config).marChannelId);")"
    # [urls] mar_origin (DIST-08): the primary MAR origin, or empty when unset. The writer
    # records an empty value as null, so the descriptor form gate can fail closed.
    MAR_ORIGIN="$(node --input-type=module -e "import { resolveConfig, marOrigin } from '$ROOT/scripts/generate.mjs'; const { config } = resolveConfig('$ROOT/configuration.toml'); console.log(marOrigin(config) ?? '');")"
    # The build identity the descriptor gates read (descriptor-monotonic, channel-live): BuildID and the
    # baked [AppUpdate] URL template from application.ini, and BUILD_TARGET (OS_TARGET_TARGET_XPCOM_ABI,
    # as UpdateUtils formats it) from the [substs] block of config.status.
    BUILD_ID="$(sed -n 's/^BuildID=//p' "$OBJ/dist/bin/application.ini")"
    UPDATE_URL="$(sed -n '/^\[AppUpdate\]/,/^\[/s/^URL=//p' "$OBJ/dist/bin/application.ini")"
    subst() { sed -n "/^substs = {/,/^[A-Za-z_][A-Za-z0-9_]* = /s/^ \{3,4\}'$1': '\([^']*\)',\{0,1\}\$/\1/p" "$OBJ/config.status"; }
    BUILD_TARGET="$(subst OS_TARGET)_$(subst TARGET_XPCOM_ABI)"
    [ -n "$BUILD_ID" ] && [ -n "$UPDATE_URL" ] && [ "${BUILD_TARGET#_}" = "$BUILD_TARGET" ] && [ "${BUILD_TARGET%_}" = "$BUILD_TARGET" ] \
        || fail "the release objdir lacks BuildID, the [AppUpdate] URL or OS_TARGET/TARGET_XPCOM_ABI (got '$BUILD_ID', '$UPDATE_URL', '$BUILD_TARGET'); rebuild the release tree"
    # Beside the tarball only. A copy in $STAGE would be packed into the archive
    # the end user installs, and its host field names the build machine.
    # JSON.stringify escapes the values; printf did not.
    node --input-type=module -e '
        import { writeFileSync } from "node:fs";
        const [out, version, releaseKey, channel, marChannel, marOrigin, buildId, buildTarget, updateUrl, tree, host] = process.argv.slice(1);
        const manifest = { version, release_key: releaseKey, update_channel: channel, mar_channel_id: marChannel,
            mar_origin: marOrigin === "" ? null : marOrigin, build_id: buildId, build_target: buildTarget, update_url: updateUrl, tree, host,
            toolchain: "container pb-gecko-build (--enable-bootstrap; see toolchain-baseline.txt)" };
        writeFileSync(out, JSON.stringify(manifest, null, 2) + "\n");
    ' "$OBJ/dist/release-manifest.json" "$VERSION" "$RELEASE_KEY" "$CHANNEL" "$MAR_CHANNEL" "$MAR_ORIGIN" \
        "$BUILD_ID" "$BUILD_TARGET" "$UPDATE_URL" \
        "$(git -C "$ROOT" rev-parse --short HEAD 2>/dev/null || echo unknown)" "$(hostname 2>/dev/null || echo unknown)"
    echo "package-linux: wrote $OBJ/dist/release-manifest.json (release $RELEASE_KEY, channel $CHANNEL)"
}

shopt -s nullglob
TARBALLS=( "$OBJ/dist"/*-"$VERSION".en-US.linux-x86_64.tar.xz )
shopt -u nullglob
test ${#TARBALLS[@]} -eq 1 || fail "expected exactly one $OBJ/dist/*-$VERSION.en-US.linux-x86_64.tar.xz, found ${#TARBALLS[@]}"
TARBALL="${TARBALLS[0]}"
tar --sort=name -C "$OBJ/dist" -cJf "$TARBALL.tmp" "$(basename "$STAGE")"
mv "$TARBALL.tmp" "$TARBALL"
echo "package-linux: wrote $TARBALL"

# G-49a: the complete MAR build-linux uploads, made from the same staged dir (precomplete refreshed
# above) the way docs/BUILD.md and package-macos.sh make it. The channel is the generator's value,
# which mozconfig.release bakes into ACCEPTED_MAR_CHANNEL_IDS; sign-publish's channel gate compares them.
MARFILE="${TARBALL%.tar.xz}.complete.mar"
MARBIN="$OBJ/dist/host/bin/mar"
test -x "$MARBIN" || fail "$MARBIN is absent; the host mar tool was not built"
rm -f "$OBJ/dist"/*.complete.mar
( cd "$ROOT/upstream" && MAR="$MARBIN" MOZ_PRODUCT_VERSION="$VERSION" MAR_CHANNEL_ID="$MAR_CHANNEL" \
    bash tools/update-packaging/make_full_update.sh "$MARFILE" "$STAGE" ) \
    || { rm -f "$MARFILE"; fail "make_full_update.sh failed on $STAGE (its output is above)"; }
test -s "$MARFILE" || { rm -f "$MARFILE"; fail "make_full_update.sh wrote no MAR at $MARFILE"; }
trap - ERR
echo "package-linux: wrote $MARFILE (MAR channel $MAR_CHANNEL)"
