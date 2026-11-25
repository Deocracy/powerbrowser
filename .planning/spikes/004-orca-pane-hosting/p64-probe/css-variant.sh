#!/usr/bin/env bash
# Phase 64 research probe (P64-14): rebuild only the spike's Route A library with a scoped
# stylesheet (PB_UNLAYER=1 also lifts @layer blocks), for measure.mjs --route a --measure css.
#   nix develop .#orca --command bash css-variant.sh <repo-root> [unlayer]
set -euo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"; SPIKE="$(cd "$HERE/.." && pwd)"
ROOT="$(cd "$1" && pwd)"; ORCA="$ROOT/orca"
COPIED=(vite.pb-probe-lib.config.ts pb-css-scope.mjs src/renderer/src/pb/pb-pane-mount.tsx)
cleanup() { for rel in "${COPIED[@]}"; do rm -f "$ORCA/$rel"; done; rmdir "$ORCA/src/renderer/src/pb" 2>/dev/null || true; }
trap cleanup EXIT
BEFORE="$(git -C "$ORCA" status --porcelain --untracked-files=no)"
for name in "${!ORCA_@}"; do unset "$name"; done; unset ELECTRON_RUN_AS_NODE NODE_OPTIONS
mkdir -p "$ORCA/src/renderer/src/pb"
cp "$HERE/vite.pb-probe-lib.config.ts" "$HERE/pb-css-scope.mjs" "$ORCA/"; cp "$SPIKE/pb-pane-mount.tsx" "$ORCA/src/renderer/src/pb/"
cd "$ORCA"
env PB_SCOPE_ROOT=':has(> [data-pb-pane-root])' PB_PROBE_TARGET=spike-scoped PB_SCOPE_CSS=1 PB_UNLAYER=$([ "${2:-}" = unlayer ] && echo 1 || echo 0) node node_modules/vite/bin/vite.js build --config vite.pb-probe-lib.config.ts > "$ROOT/.mozbuild/p64-probe/css-variant.log" 2>&1
cleanup
[ "$(git -C "$ORCA" status --porcelain --untracked-files=no)" = "$BEFORE" ] || { echo "css-variant: FAIL -- tracked change"; exit 1; }
echo "css-variant: PASS -- ${2:-layered} css-bytes=$(stat -c %s "$ORCA/out/web/assets/pb-lib/pb-pane-lib.css") layers=$(grep -o '@layer' "$ORCA/out/web/assets/pb-lib/pb-pane-lib.css" | wc -l)"
