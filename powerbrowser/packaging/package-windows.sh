#!/usr/bin/env bash
# powerbrowser/packaging/package-windows.sh -- the Windows stage (Phase 54, PKG-13 assembly).
# Mirrors package-linux.sh's order for the win64 target, with three differences:
#   - the sidecar comes ONLY from a hosted-artifact directory (PB_WIN_SIDECAR_DIR, built on
#     windows-latest and uploaded), never from theia/ on legion: a Linux native cannot reach
#     the Windows stage by construction (Pitfall 1);
#   - the sidecar artifact is checked by its SHA256SUMS manifest before anything is copied, so a
#     hash mismatch between the hosted upload and the handed-over files stops the stage naming the file;
#   - the Node runtime is the win32-x64 zip pinned in node-runtime.json, extracted with python3's zipfile.
# The installer (mach repackage installer) and the complete MAR (mach repackage mar) run after
# this stage in the build-windows job, in that order; this script ends with the native gate.
# Run from the repo root inside the release container, after `./mach build` with the Windows mozconfig:
#   PB_WIN_SIDECAR_DIR=/path/to/windows-latest-artifact bash powerbrowser/packaging/package-windows.sh
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
OBJ="$ROOT/objdir-windows-x86_64"
SIDECAR_DIR="${PB_WIN_SIDECAR_DIR:-}"
fail() { echo "package-windows: FAIL -- $*" >&2; exit 1; }

test -n "$SIDECAR_DIR" || fail "PB_WIN_SIDECAR_DIR is unset; point it at the windows-latest sidecar artifact (never a legion build)"
test -f "$SIDECAR_DIR/SHA256SUMS" || fail "$SIDECAR_DIR/SHA256SUMS is absent; the hosted job must upload its checksum manifest with the sidecar"
test -f "$SIDECAR_DIR/backend/main.js" || fail "$SIDECAR_DIR/backend/main.js is absent from the windows-latest sidecar artifact"
# Hash agreement: every file the manifest names must hash as the manifest says, before any copy.
( cd "$SIDECAR_DIR" && sha256sum -c --quiet SHA256SUMS ) || fail "the sidecar artifact does not agree with its SHA256SUMS; nothing is staged"

# The pinned win32-x64 Node release (PKG-13): url and sha256 from node-runtime.json, never typed here.
read -r NODE_VERSION NODE_URL NODE_SHA < <(python3 -c 'import json,sys; p=json.load(open(sys.argv[1]))["win32-x64"]; print(p["version"], p["url"], p["sha256"])' "$ROOT/powerbrowser/packaging/node-runtime.json")
CACHE="$ROOT/.mozbuild/node-dist"; mkdir -p "$CACHE"
ARCHIVE="$CACHE/$(basename "$NODE_URL")"
if [ ! -f "$ARCHIVE" ]; then
    curl -fsSL -o "$ARCHIVE.part" "$NODE_URL" || { rm -f "$ARCHIVE.part"; fail "downloading $NODE_URL failed"; }
    mv "$ARCHIVE.part" "$ARCHIVE"
fi
echo "$NODE_SHA  $ARCHIVE" | sha256sum -c --quiet - || { rm -f "$ARCHIVE"; fail "$ARCHIVE does not hash to the pin in powerbrowser/packaging/node-runtime.json"; }

( cd "$ROOT/upstream" && MOZCONFIG="$ROOT/generated/packaging/mozconfig-windows-x86_64" ./mach package )

STAGE="$(find "$OBJ/dist" -mindepth 1 -maxdepth 1 -type d -exec test -f '{}/precomplete' \; -print | head -n 1)"
test -n "$STAGE" || fail "no staged app dir with a precomplete under $OBJ/dist"
rm -rf "$STAGE/theia" "$STAGE/node"
mkdir -p "$STAGE/theia" "$STAGE/node" "$STAGE/distribution"
cp -a "$SIDECAR_DIR/." "$STAGE/theia/"
rm -f "$STAGE/theia/SHA256SUMS"

python3 - "$ARCHIVE" "$STAGE/node" "node-$NODE_VERSION-win-x64" <<'PY' || fail "the win32-x64 Node archive could not be extracted"
import sys, zipfile, os
archive, dest, prefix = sys.argv[1], sys.argv[2], sys.argv[3]
with zipfile.ZipFile(archive) as z:
    for name in (f"{prefix}/node.exe", f"{prefix}/LICENSE"):
        data = z.read(name)
        out = os.path.join(dest, os.path.basename(name))
        with open(out, "wb") as fh:
            fh.write(data)
PY
test -f "$STAGE/node/node.exe" || fail "the staged Windows node.exe is absent"
cp "$ROOT/powerbrowser/distribution/policies.json" "$STAGE/distribution/policies.json"

# Checkout-path purge, as package-linux.sh does for its backend bundles: no staged text file may
# name the builder's checkout. Native binaries are checked by the natives gate below, not here.
while IFS= read -r hit; do
    fail "the staged sidecar still carries a checkout path: $hit"
done < <(grep -rlI -F "$ROOT/" "$STAGE/theia" "$STAGE/node" 2>/dev/null || true)

# PKG-13 native gate, before precomplete is refreshed: every .node, rg and node binary in the
# Windows stage must be PE32+ x86-64. A Linux or Mach-O native here stops the stage naming the file.
node "$ROOT/scripts/verify-package-target-natives.mjs" --target win64 --stage "$STAGE" \
    || fail "a staged native is not PE32+ x86-64; the Windows stage is not assembled"

( cd "$STAGE" && python3 "$ROOT/upstream/config/createprecomplete.py" )
echo "package-windows: staged $STAGE (sidecar from $SIDECAR_DIR, node $NODE_VERSION win32-x64)"
