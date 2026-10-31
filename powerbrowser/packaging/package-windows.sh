#!/usr/bin/env bash
# powerbrowser/packaging/package-windows.sh -- the Windows stage (Phase 54, PKG-13 assembly).
# Mirrors package-linux.sh's order for the win64 target, with these differences:
#   - the sidecar comes ONLY from a hosted-artifact directory (PB_WIN_SIDECAR_DIR, built on
#     windows-latest and uploaded), never from theia/ on legion: a Linux native cannot reach
#     the Windows stage by construction (Pitfall 1);
#   - the artifact is admitted by check-win-sidecar.sh before anything is copied: SHA256SUMS must hash to
#     PB_WIN_SIDECAR_SUMS_SHA256 (recorded by the producing job outside the artifact), its paths must equal the
#     files present as sets, and no symlink may ride along. The hosted build root it records is purged from
#     the stage in both slash forms;
#   - the Node runtime is the win32-x64 zip pinned in node-runtime.json, extracted with python3's zipfile;
#   - the package zip `mach package` wrote is REWRITTEN from the staged tree (as package-linux.sh rewrites its
#     tarball), because the installer and the complete MAR are built from that zip: without the rewrite they
#     would carry a stock Gecko tree with no sidecar and no Node runtime.
# After the stage it runs `mach repackage installer` and `mach repackage mar` with the arguments the pinned
# tree defines (upstream/python/mozbuild/mozbuild/mach_commands.py: the installer command at 3115-3152 requires --tag
# --setupexe --output --sfx-stub; the mar command at 3467-3475 requires --input --mar --output --arch), and writes both
# to $OBJ/dist/release-windows/, the one directory the release workflow uploads from.
# Run from the repo root inside the release container, after `./mach build` with the Windows mozconfig:
#   PB_WIN_SIDECAR_DIR=/path/to/windows-latest-artifact PB_WIN_SIDECAR_SUMS_SHA256=<64 hex> \
#     bash powerbrowser/packaging/package-windows.sh
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
OBJ="$ROOT/objdir-windows-x86_64"
OUT="$OBJ/dist/release-windows"
MOZCONFIG_WIN="$ROOT/generated/packaging/mozconfig-windows-x86_64"
SIDECAR_DIR="${PB_WIN_SIDECAR_DIR:-}"
fail() { echo "package-windows: FAIL -- $*" >&2; exit 1; }

test -n "$SIDECAR_DIR" || fail "PB_WIN_SIDECAR_DIR is unset; point it at the windows-latest sidecar artifact (never a legion build)"
test -f "$SIDECAR_DIR/backend/main.js" || fail "$SIDECAR_DIR/backend/main.js is absent from the windows-latest sidecar artifact"
bash "$ROOT/powerbrowser/packaging/check-win-sidecar.sh" check "$SIDECAR_DIR" "${PB_WIN_SIDECAR_SUMS_SHA256:-}" || fail "the sidecar artifact was not admitted; nothing is staged"

# The pinned win32-x64 Node release (PKG-13): url and sha256 from node-runtime.json, never typed here.
read -r NODE_VERSION NODE_URL NODE_SHA < <(python3 -c 'import json,sys; p=json.load(open(sys.argv[1]))["win32-x64"]; print(p["version"], p["url"], p["sha256"])' "$ROOT/powerbrowser/packaging/node-runtime.json")
CACHE="$ROOT/.mozbuild/node-dist"; mkdir -p "$CACHE"
ARCHIVE="$CACHE/$(basename "$NODE_URL")"
if [ ! -f "$ARCHIVE" ]; then
    curl -fsSL -o "$ARCHIVE.part" "$NODE_URL" || { rm -f "$ARCHIVE.part"; fail "downloading $NODE_URL failed"; }
    mv "$ARCHIVE.part" "$ARCHIVE"
fi
echo "$NODE_SHA  $ARCHIVE" | sha256sum -c --quiet - || { rm -f "$ARCHIVE"; fail "$ARCHIVE does not hash to the pin in powerbrowser/packaging/node-runtime.json"; }

( cd "$ROOT/upstream" && MOZCONFIG="$MOZCONFIG_WIN" ./mach package )

STAGE="$(find "$OBJ/dist" -mindepth 1 -maxdepth 1 -type d -exec test -f '{}/precomplete' \; -print | head -n 1)"
test -n "$STAGE" || fail "no staged app dir with a precomplete under $OBJ/dist"
rm -rf "$STAGE/theia" "$STAGE/node"
mkdir -p "$STAGE/theia" "$STAGE/node" "$STAGE/distribution"
cp -a "$SIDECAR_DIR/." "$STAGE/theia/"
rm -f "$STAGE/theia/SHA256SUMS" "$STAGE/theia/BUILD_ROOT"

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

# Checkout-path purge, as package-linux.sh does for its backend bundles: no staged text file may name a
# builder's checkout. The sidecar was built on windows-latest, so it carries the hosted workspace root the job
# recorded in BUILD_ROOT (checked in every slash form); the container's own checkout is checked as well.
# Native binaries are checked by the natives gate below, not here.
bash "$ROOT/powerbrowser/packaging/check-win-sidecar.sh" purge "$SIDECAR_DIR" "$STAGE/theia" "$STAGE/node" || fail "the staged sidecar names the hosted build root"
rc=0
hit="$(grep -rlI -F -e "$ROOT/" "$STAGE/theia" "$STAGE/node")" || rc=$?
[ "$rc" -le 1 ] || fail "grep could not read the stage while looking for the container checkout path (exit $rc)"
[ -z "$hit" ] || fail "the staged sidecar still carries a checkout path: $(head -n1 <<<"$hit")"

# PKG-13 native gate, before precomplete is refreshed: every .node, rg and node binary in the
# Windows stage must be PE32+ x86-64. A Linux or Mach-O native here stops the stage naming the file.
node "$ROOT/scripts/verify-package-target-natives.mjs" --target win64 --stage "$STAGE" \
    || fail "a staged native is not PE32+ x86-64; the Windows stage is not assembled"

( cd "$STAGE" && python3 "$ROOT/upstream/config/createprecomplete.py" )

# Rewrite the package zip mach wrote, so the installer and the complete MAR carry the staged tree.
shopt -s nullglob
ZIPS=( "$OBJ/dist"/*.en-US.win64.zip )
shopt -u nullglob
test ${#ZIPS[@]} -eq 1 || fail "expected exactly one $OBJ/dist/*.en-US.win64.zip, found ${#ZIPS[@]}"
ZIP="${ZIPS[0]}"
test -z "$(find "$STAGE" -type l -print -quit)" || fail "the staged tree contains a symlink; it cannot be zipped for Windows"
python3 - "$ZIP" "$STAGE" <<'PY' || fail "the package zip could not be rewritten from the staged tree"
import os, sys, zipfile
zip_path, stage = sys.argv[1], sys.argv[2]
top = os.path.basename(stage)
tmp = zip_path + ".tmp"
with zipfile.ZipFile(tmp, "w", zipfile.ZIP_DEFLATED) as z:
    for dirpath, dirnames, filenames in os.walk(stage):
        dirnames.sort()
        for f in sorted(filenames):
            full = os.path.join(dirpath, f)
            z.write(full, os.path.join(top, os.path.relpath(full, stage)))
os.replace(tmp, zip_path)
PY

# The installer (setup.exe from the objdir installer stage, the app.tag, the 7z SFX stub) and the complete MAR.
# Output names derive from the zip's, in one directory the release workflow uploads from.
BASE="$(basename "${ZIP%.zip}")"
SETUPEXE="$OBJ/browser/installer/windows/instgen/setup.exe"
MARBIN="$OBJ/dist/host/bin/mar"
test -f "$SETUPEXE" || fail "$SETUPEXE is absent; mach package did not build the installer stage"
test -x "$MARBIN" || fail "$MARBIN is absent; the host mar tool was not built"
MAR_CHANNEL="$(sed -n 's/^ACCEPTED_MAR_CHANNEL_IDS=//p' "$STAGE/update-settings.ini" | head -n 1)"
MAR_CHANNEL="${MAR_CHANNEL%%,*}"
test -n "$MAR_CHANNEL" || fail "$STAGE/update-settings.ini carries no ACCEPTED_MAR_CHANNEL_IDS; the MAR channel cannot be derived from the build"
rm -rf "$OUT"; mkdir -p "$OUT"
( cd "$ROOT/upstream" && MOZCONFIG="$MOZCONFIG_WIN" ./mach repackage installer \
    --package "$ZIP" --package-name "$(basename "$STAGE")" \
    --tag browser/installer/windows/app.tag --setupexe "$SETUPEXE" \
    --sfx-stub other-licenses/7zstub/firefox/7zSD.Win32.sfx \
    --output "$OUT/$BASE.installer.exe" )
( cd "$ROOT/upstream" && MOZCONFIG="$MOZCONFIG_WIN" ./mach repackage mar \
    --input "$ZIP" --mar "$MARBIN" --arch x86_64 --mar-channel-id "$MAR_CHANNEL" \
    --output "$OUT/$BASE.complete.mar" )
test -s "$OUT/$BASE.installer.exe" || fail "the installer was not written to $OUT"
test -s "$OUT/$BASE.complete.mar" || fail "the complete MAR was not written to $OUT"
echo "package-windows: staged $STAGE (sidecar from $SIDECAR_DIR, node $NODE_VERSION win32-x64); wrote $OUT/$BASE.installer.exe and $OUT/$BASE.complete.mar"
