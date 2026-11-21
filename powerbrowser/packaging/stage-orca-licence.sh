#!/usr/bin/env bash
# powerbrowser/packaging/stage-orca-licence.sh -- stage Orca's own licence as <GreD>/orca/LICENSE
# (packaging-prefs-network-02).
#
#   bash powerbrowser/packaging/stage-orca-licence.sh ROOT ORCA_STAGE
#
# The packaged orcad, orcad-server and web client are compiled from Orca's MIT-licensed source, and
# the MIT licence requires its copyright and permission notice in every copy. The file copied is
# ROOT/orca/<licence_file> from the orca row of inventory/licence-allowlist.json "trees", and it must
# hash to that row's licence_file_sha256: a re-pin that changes the notice is reviewed there first.
# The same text heads the Orca section of THIRD-PARTY-NOTICES.txt (scripts/generate-licensing.mjs).
set -euo pipefail
fail() { echo "stage-orca-licence: FAIL -- $*" >&2; exit 1; }
[ "$#" -eq 2 ] || { echo "usage: bash powerbrowser/packaging/stage-orca-licence.sh ROOT ORCA_STAGE" >&2; exit 2; }
ROOT="$1"
read -r FILE DIGEST < <(node -e '
    const row = JSON.parse(require("fs").readFileSync(process.argv[1], "utf8")).trees.find((t) => t.path === "orca");
    if (!row || !row.licence_file || !row.licence_file_sha256) process.exit(3);
    console.log(row.licence_file, row.licence_file_sha256);
' "$ROOT/inventory/licence-allowlist.json") || fail "inventory/licence-allowlist.json has no trees row for orca with licence_file and licence_file_sha256"
SRC="$ROOT/orca/$FILE"
test -f "$SRC" || fail "$SRC is absent; run bash scripts/fetch-orca.sh first"
echo "$DIGEST  $SRC" | sha256sum -c --quiet - || fail "$SRC does not hash to the licence_file_sha256 that inventory/licence-allowlist.json records for orca"
test -d "$2" || fail "$2 is absent; stage the Orca tree before its licence"
cp "$SRC" "$2/LICENSE"
