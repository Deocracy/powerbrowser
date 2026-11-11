#!/usr/bin/env bash
# powerbrowser/packaging/stage-bundled-xpi.sh -- BEXT-02 (P68-39).
# Stages every add-on pinned in powerbrowser/packaging/bundled-xpi.json into
# <distribution-dir>/extensions/<id>.xpi, the file Gecko's installDistributionAddons
# reads on a profile's first start (the file name must be exactly <id>.xpi).
# The XPI is the AMO-signed download, byte for byte: never modified, repacked or
# vendored into the tree. Downloads are cached in the git-ignored
# .mozbuild/bundled-xpi/<id>-<version>.xpi and every staging re-checks the pin's sha256.
# Called once by package-linux.sh, package-windows.sh and package-macos.sh, beside
# their policies.json copy.
#   bash powerbrowser/packaging/stage-bundled-xpi.sh <distribution-dir>
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
PIN="$ROOT/powerbrowser/packaging/bundled-xpi.json"
fail() { echo "stage-bundled-xpi: FAIL -- $*" >&2; exit 1; }
[ "$#" -eq 1 ] || { echo "usage: bash powerbrowser/packaging/stage-bundled-xpi.sh <distribution-dir>" >&2; exit 2; }
DEST="$1/extensions"
CACHE="$ROOT/.mozbuild/bundled-xpi"
mkdir -p "$DEST" "$CACHE"
digest() { sha256sum "$1" | cut -d' ' -f1; }
N=0

while read -r ID VERSION URL SHA; do
    XPI="$CACHE/$ID-$VERSION.xpi"
    if [ ! -f "$XPI" ] || [ "$(digest "$XPI")" != "$SHA" ]; then
        rm -f "$XPI"
        curl -fsSL -o "$XPI.part" "$URL" || { rm -f "$XPI.part"; fail "$ID: downloading $URL failed"; }
        mv "$XPI.part" "$XPI"
    fi
    if ! echo "$SHA  $XPI" | sha256sum -c --quiet - >/dev/null 2>&1; then
        GOT="$(digest "$XPI")"
        rm -f "$XPI"
        fail "$ID: the download hashes to $GOT, the pin in powerbrowser/packaging/bundled-xpi.json is $SHA"
    fi
    cp "$XPI" "$DEST/$ID.xpi"
    echo "stage-bundled-xpi: $ID $VERSION staged"
    N=$((N + 1))
done < <(python3 -I -c 'import json,sys
for k,v in json.load(open(sys.argv[1])).items():
    if not k.startswith("$"): print(k, v["version"], v["url"], v["sha256"])' "$PIN")
# A pin file python3 could not read yields no lines, not an error, so zero staged is a failure.
[ "$N" -gt 0 ] || fail "no add-on was read from $PIN"
