#!/usr/bin/env bash
# Phase 66 research gate (P66-02): build the thin-host probe bundle with Orca's own Vite.
#
# Run inside the Orca dev shell, after scripts/build-orca.sh:
#   nix develop .#orca --command bash .planning/spikes/005-orca-browser-parity/build-p66-thin-host.sh
#
# Copies p66-thin-host.ts and vite.p66.config.ts into untracked paths in orca/, runs
# vite build --config, removes the copies on exit. The tracked Orca state
# (including seams build-orca.sh applied) must be identical before and after. Output: orca/out/web/assets/pb-p66/pb-p66-thin-host.js (ignored).
set -euo pipefail

SPIKE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ORCA="$(cd "$SPIKE/../../.." && pwd)/orca"
HOST_COPY="$ORCA/src/renderer/src/web/pb-p66-thin-host.ts"
CONFIG_COPY="$ORCA/vite.pb-p66.config.ts"

fail() { echo "build-p66-thin-host: FAIL -- $1" >&2; exit 1; }
tracked_changes() { git -C "$ORCA" status --porcelain --untracked-files=no; }

[ -f "$ORCA/node_modules/vite/bin/vite.js" ] || fail "orca/node_modules/vite absent; run scripts/build-orca.sh first"
# The applied overlay seams (build-orca.sh) may already show as tracked changes; the probe must not add or alter any.
BEFORE="$(git -C "$ORCA" diff HEAD --stat --no-color; tracked_changes)"

# Variables inherited from an Orca desktop session must never reach the build.
for name in "${!ORCA_@}"; do unset "$name"; done
unset ELECTRON_RUN_AS_NODE NODE_OPTIONS NODE_REPL_EXTERNAL_MODULE

trap 'rm -f "$HOST_COPY" "$CONFIG_COPY"' EXIT
cp "$SPIKE/p66-thin-host.ts" "$HOST_COPY"
cp "$SPIKE/vite.p66.config.ts" "$CONFIG_COPY"

(cd "$ORCA" && node node_modules/vite/bin/vite.js build --config vite.pb-p66.config.ts) || fail "vite build exited $?"

[ -s "$ORCA/out/web/assets/pb-p66/pb-p66-thin-host.js" ] || fail "no out/web/assets/pb-p66/pb-p66-thin-host.js was written"
rm -f "$HOST_COPY" "$CONFIG_COPY"
[ "$(git -C "$ORCA" diff HEAD --stat --no-color; tracked_changes)" = "$BEFORE" ] || fail "the build changed a tracked Orca file"
echo "build-p66-thin-host: PASS -- orca/out/web/assets/pb-p66/pb-p66-thin-host.js $(stat -c %s "$ORCA/out/web/assets/pb-p66/pb-p66-thin-host.js") bytes; tracked Orca state unchanged by the build"
