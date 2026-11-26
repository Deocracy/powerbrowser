#!/usr/bin/env bash
# powerbrowser/packaging/build-better-sqlite3-linux.sh -- build the better-sqlite3 binding the Linux
# package ships, from the package's own source, against the release sysroot (PKG-22).
#
#   bash powerbrowser/packaging/build-better-sqlite3-linux.sh ROOT NODE_ARCHIVE NODE_VERSION WORK OUT
#
# Why the npm prebuild is not shipped: better-sqlite3's prebuilds/linux-x64.node comes inside the npm
# tarball and was linked on its publisher's host. It requires GLIBC_2.34 and GLIBCXX_3.4.29 (first
# release package, 2026-11-26), above the shipped floor in portability-floor.json (glibc 2.28). The tab
# store opens its database through this binding, so on a glibc 2.28 to 2.33 host the sidecar would
# fail to load it. The package's source (binding.gyp, src/, deps/ with the SQLite amalgamation) ships
# in the same npm tarball, so the binding is rebuilt here the way the Gecko libraries beside it are
# built: with the bootstrapped clang against the bootstrapped sysroot (toolchain-baseline.txt), both
# in the mach state directory of the release container.
#
# Inputs, none fetched here:
#   ROOT          the checkout; theia/node_modules holds better-sqlite3, node-addon-api and node-gyp
#                 after the workflow's frozen `yarn install`
#   NODE_ARCHIVE  the pinned official Node archive package-linux.sh already verified against
#                 node-runtime.json; its bin/node runs node-gyp and its include/node are the headers
#                 (--nodedir), so node-gyp downloads nothing
#   NODE_VERSION  the pinned version string (the archive's top-level directory name carries it)
#   WORK          a scratch directory this script owns and recreates (under the release objdir)
#   OUT           where the built binding is written (the staged prebuilds/linux-x64.node)
#
# The binding is N-API (node-addon-api, NAPI_VERSION in binding.gyp), so it does not depend on the
# Node that ran node-gyp. libstdc++ and libgcc are linked statically: a glibc 2.28 distribution ships
# an older libstdc++ than the sysroot's, and the binding must not need a newer one than the host has.
# The portable-elf row, not this script, is the verdict on the result; this script only refuses to
# write a binding the pinned Node cannot load.
set -euo pipefail
fail() { echo "build-better-sqlite3-linux: FAIL -- $*" >&2; exit 1; }
[ "$#" -eq 5 ] || { echo "usage: bash powerbrowser/packaging/build-better-sqlite3-linux.sh ROOT NODE_ARCHIVE NODE_VERSION WORK OUT" >&2; exit 2; }
ROOT="$1"; NODE_ARCHIVE="$2"; NODE_VERSION="$3"; WORK="$4"; OUT="$5"

SRC="$ROOT/theia/node_modules/better-sqlite3"
GYP="$ROOT/theia/node_modules/node-gyp/bin/node-gyp.js"
STATE="${MOZBUILD_STATE_PATH:-$HOME/.mozbuild}"
CLANG_BIN="$STATE/clang/bin"
SYSROOT="$STATE/sysroot-x86_64-linux-gnu"
test -f "$SRC/binding.gyp" && test -d "$SRC/src" && test -d "$SRC/deps" || fail "$SRC lacks binding.gyp, src/ or deps/; run the frozen yarn install in theia/ first"
test -f "$ROOT/theia/node_modules/node-addon-api/package.json" || fail "$ROOT/theia/node_modules/node-addon-api is absent; run the frozen yarn install in theia/ first"
test -f "$GYP" || fail "$GYP is absent; run the frozen yarn install in theia/ first"
test -f "$NODE_ARCHIVE" || fail "$NODE_ARCHIVE is absent"
test -x "$CLANG_BIN/clang" && test -x "$CLANG_BIN/ld.lld" && test -x "$CLANG_BIN/llvm-ar" || fail "no bootstrapped clang, ld.lld and llvm-ar under $CLANG_BIN; this runs in the release container after the release build (release.yml mounts .mozbuild/release-state as the mach state directory)"
test -d "$SYSROOT/usr/include" || fail "no bootstrapped sysroot at $SYSROOT; this runs in the release container after the release build"

rm -rf "$WORK"
mkdir -p "$WORK/node" "$WORK/pkg" "$WORK/home"
tar -xJf "$NODE_ARCHIVE" -C "$WORK/node" --strip-components=1 "node-$NODE_VERSION-linux-x64/bin/node" "node-$NODE_VERSION-linux-x64/include"
NODE="$WORK/node/bin/node"
test "$("$NODE" --version)" = "$NODE_VERSION" || fail "the node in $NODE_ARCHIVE does not report $NODE_VERSION"
test -f "$WORK/node/include/node/node_api.h" || fail "$NODE_ARCHIVE carries no include/node/node_api.h"

# A copy, so the host's theia/node_modules is never written to. prebuilds/ stays out: nothing here may
# fall back to the binary this script replaces.
cp -a "$SRC/binding.gyp" "$SRC/package.json" "$SRC/src" "$SRC/deps" "$SRC/lib" "$WORK/pkg/"

(
    cd "$WORK/pkg"
    export PATH="$WORK/node/bin:$CLANG_BIN:$PATH"
    export HOME="$WORK/home"
    # binding.gyp resolves node-addon-api with `node -p "require('node-addon-api').include"`.
    export NODE_PATH="$ROOT/theia/node_modules"
    export CC="$CLANG_BIN/clang --sysroot=$SYSROOT"
    export CXX="$CLANG_BIN/clang++ --sysroot=$SYSROOT"
    export AR="$CLANG_BIN/llvm-ar"
    export LDFLAGS="-fuse-ld=lld -static-libstdc++ -static-libgcc"
    "$NODE" "$GYP" rebuild --release --force_build=1 --nodedir="$WORK/node" >"$WORK/node-gyp.log" 2>&1
) || { tail -n 40 "$WORK/node-gyp.log" >&2 || true; fail "node-gyp rebuild failed (its last lines are above; the full log is $WORK/node-gyp.log)"; }

BUILT="$WORK/pkg/build/Release/better_sqlite3.node"
test -s "$BUILT" || fail "node-gyp wrote no $BUILT (log: $WORK/node-gyp.log)"
# The pinned Node must load the binding and run a statement through it before it is staged.
mkdir -p "$WORK/load/node_modules/better-sqlite3/prebuilds"
cp -a "$WORK/pkg/lib" "$WORK/pkg/package.json" "$WORK/load/node_modules/better-sqlite3/"
cp "$BUILT" "$WORK/load/node_modules/better-sqlite3/prebuilds/linux-x64.node"
GOT="$(cd "$WORK/load" && "$NODE" -e 'const D = require("better-sqlite3"); const db = new D(":memory:"); process.stdout.write(String(db.prepare("select 6 * 7 as n").get().n)); db.close();')" \
    || fail "the pinned Node could not load the built binding"
[ "$GOT" = "42" ] || fail "the built binding answered '$GOT' to select 6 * 7"
mkdir -p "$(dirname "$OUT")"
cp "$BUILT" "$OUT"
echo "build-better-sqlite3-linux: wrote $OUT (built from $SRC with $("$CLANG_BIN/clang" --version | head -n 1) against $SYSROOT)"
