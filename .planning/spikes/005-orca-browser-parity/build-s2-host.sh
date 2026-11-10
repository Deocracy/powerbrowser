#!/usr/bin/env bash
# Spike 005 (BRW-01, P61-13): build the S2 host bundle with Orca's own Vite.
#
# Run inside the Orca dev shell, after scripts/build-orca.sh:
#   nix develop .#orca --command bash .planning/spikes/005-orca-browser-parity/build-s2-host.sh
#
# Copies s2-host.ts and vite.s2.config.ts into untracked paths in orca/, runs
# vite build --config, removes the copies on exit. No tracked Orca file may
# change: git -C orca status --porcelain --untracked-files=no must be empty
# before and after. Output: orca/out/web/assets/pb-s2/pb-s2-host.js (ignored).
set -euo pipefail

SPIKE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ORCA="$(cd "$SPIKE/../../.." && pwd)/orca"
HOST_COPY="$ORCA/src/renderer/src/web/pb-s2-host.ts"
CONFIG_COPY="$ORCA/vite.pb-s2.config.ts"

fail() { echo "build-s2-host: FAIL -- $1" >&2; exit 1; }
tracked_changes() { git -C "$ORCA" status --porcelain --untracked-files=no; }

[ -f "$ORCA/node_modules/vite/bin/vite.js" ] || fail "orca/node_modules/vite absent; run scripts/build-orca.sh first"
[ -z "$(tracked_changes)" ] || fail "a tracked Orca file is modified before the build"

# Variables inherited from an Orca desktop session must never reach the build.
for name in "${!ORCA_@}"; do unset "$name"; done
unset ELECTRON_RUN_AS_NODE NODE_OPTIONS NODE_REPL_EXTERNAL_MODULE

trap 'rm -f "$HOST_COPY" "$CONFIG_COPY"' EXIT
cp "$SPIKE/s2-host.ts" "$HOST_COPY"
cp "$SPIKE/vite.s2.config.ts" "$CONFIG_COPY"

(cd "$ORCA" && node node_modules/vite/bin/vite.js build --config vite.pb-s2.config.ts) || fail "vite build exited $?"

[ -s "$ORCA/out/web/assets/pb-s2/pb-s2-host.js" ] || fail "no out/web/assets/pb-s2/pb-s2-host.js was written"
rm -f "$HOST_COPY" "$CONFIG_COPY"
[ -z "$(tracked_changes)" ] || fail "a tracked Orca file is modified after the build"
echo "build-s2-host: PASS -- orca/out/web/assets/pb-s2/pb-s2-host.js $(stat -c %s "$ORCA/out/web/assets/pb-s2/pb-s2-host.js") bytes; no tracked Orca file modified"
