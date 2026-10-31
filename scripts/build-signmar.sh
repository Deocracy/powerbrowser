#!/usr/bin/env bash
# scripts/build-signmar.sh <outdir> [--from-dir <upstream checkout>]
#
# Builds signmar from the pinned Firefox source, on a hosted runner, for sign-publish (review
# BL-01: the secret-holding job must run nothing the legion runner produced). The pin is
# powerbrowser/packaging/signmar/SOURCES.sha256: the ESR tag, the commit it names, and the sha256
# of each libmar file. Each file is fetched by exact commit from raw.githubusercontent.com and
# refused unless its sha256 equals the recorded one, so a moved tag or a hostile mirror cannot
# change the signer. Needs cc, c++, pkg-config and libnss3-dev (apt on ubuntu-latest).
#
# --from-dir reads the files from a local upstream checkout instead of the network (the same hash
# check applies); it exists so the build can be proven offline.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PIN="$ROOT/powerbrowser/packaging/signmar/SOURCES.sha256"
OUT="${1:?usage: build-signmar.sh <outdir> [--from-dir <upstream>]}"
FROM=""
if [ "${2:-}" = "--from-dir" ]; then FROM="${3:?--from-dir needs a directory}"; fi

COMMIT="$(sed -n 's/^# commit //p' "$PIN")"
[[ "$COMMIT" =~ ^[0-9a-f]{40}$ ]] || { echo "build-signmar: FAIL -- $PIN has no 40-hex '# commit' line" >&2; exit 1; }

SRC="$(mktemp -d)"
trap 'rm -rf "$SRC"' EXIT
mkdir -p "$OUT"
COUNT=0
while read -r SUM FILE; do
  case "$SUM" in '#'*|'') continue ;; esac
  [[ "$SUM" =~ ^[0-9a-f]{64}$ && "$FILE" =~ ^[A-Za-z0-9_./-]+$ && "$FILE" != *..* ]] \
    || { echo "build-signmar: FAIL -- malformed pin line '$SUM $FILE'" >&2; exit 1; }
  mkdir -p "$SRC/$(dirname "$FILE")"
  if [ -n "$FROM" ]; then
    cp "$FROM/$FILE" "$SRC/$FILE"
  else
    curl --fail --silent --show-error --location --proto '=https' --tlsv1.2 \
      "https://raw.githubusercontent.com/mozilla-firefox/firefox/$COMMIT/$FILE" -o "$SRC/$FILE"
  fi
  [ "$(sha256sum "$SRC/$FILE" | cut -d' ' -f1)" = "$SUM" ] \
    || { echo "build-signmar: FAIL -- $FILE at $COMMIT does not match the pinned sha256 $SUM; nothing is built" >&2; exit 1; }
  COUNT=$((COUNT + 1))
done < "$PIN"
[ "$COUNT" -gt 0 ] || { echo "build-signmar: FAIL -- $PIN lists no files" >&2; exit 1; }

L="$SRC/modules/libmar"
C="$SRC/other-licenses/nsis/Contrib/CityHash/cityhash"
NSS_FLAGS=$(pkg-config --cflags --libs nss nspr)
c++ -O2 -c -I"$C" "$C/city.cpp" -o "$SRC/city.o"
# MAR_CHANNEL_ID and MOZ_APP_VERSION feed only the `signmar` banner; -T, -s and -v do not read them.
# shellcheck disable=SC2086 -- pkg-config emits separate flags
cc -O2 -DMAR_NSS -DMAR_CHANNEL_ID='"release-tool"' -DMOZ_APP_VERSION='"pinned-source"' \
  -I"$L/src" -I"$L/sign" -I"$L/verify" -I"$C" $NSS_FLAGS \
  "$L/tool/mar.c" "$L/src/mar_create.c" "$L/src/mar_extract.c" "$L/src/mar_read.c" \
  "$L/sign/mar_sign.c" "$L/sign/nss_secutil.c" "$L/verify/cryptox.c" "$L/verify/mar_verify.c" \
  "$SRC/city.o" -lstdc++ -o "$OUT/signmar"
sha256sum "$OUT/signmar"
