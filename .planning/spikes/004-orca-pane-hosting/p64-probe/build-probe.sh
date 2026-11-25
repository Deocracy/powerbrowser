#!/usr/bin/env bash
# Phase 64 research probe: build the probe entries with Orca's own Vite, beside Orca's untouched
# build, in the tree named by $1 (a lane worktree that already ran scripts/build-orca.sh and the
# spike's build-pb-entry.sh). Inputs are copied into orca/ as untracked files and removed on exit.
#   nix develop .#orca --command bash build-probe.sh <repo-root>
# Last line: build-probe: PASS -- <counts>  or  build-probe: FAIL -- <assertion>
set -euo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SPIKE="$(cd "$HERE/.." && pwd)"
ROOT="$(cd "${1:?usage: build-probe.sh <repo-root>}" && pwd)"
ORCA="$ROOT/orca"
OUT="$ROOT/.mozbuild/p64-probe"
mkdir -p "$OUT"; LOG="$OUT/build-probe.log"; : > "$LOG"
COPIED=(vite.pb-probe-lib.config.ts vite.pb-probe-esm.config.ts pb-css-scope.mjs src/renderer/src/pb/pb-probe-mount.tsx src/renderer/src/pb/pb-pane-mount.tsx)
cleanup() { for rel in "${COPIED[@]}"; do rm -f "$ORCA/$rel"; done; rmdir "$ORCA/src/renderer/src/pb" 2>/dev/null || true; }
trap cleanup EXIT
fail() { cleanup; echo "build-probe: FAIL -- $1; log $LOG"; exit 1; }
tracked() { git -C "$ORCA" status --porcelain --untracked-files=no; }
BEFORE="$(tracked)"
[ -f "$ORCA/out/web/web-index.html" ] || fail "precondition: run scripts/build-orca.sh first"
[ ! -e "$ORCA/src/renderer/src/pb" ] || fail "precondition: orca/src/renderer/src/pb exists"
for name in "${!ORCA_@}"; do unset "$name"; done
unset ELECTRON_RUN_AS_NODE NODE_OPTIONS NODE_REPL_EXTERNAL_MODULE
export DO_NOT_TRACK=1
mkdir -p "$ORCA/src/renderer/src/pb"
cp "$HERE/vite.pb-probe-lib.config.ts" "$HERE/vite.pb-probe-esm.config.ts" "$HERE/pb-css-scope.mjs" "$ORCA/"
cp "$HERE/pb-probe-mount.tsx" "$SPIKE/pb-pane-mount.tsx" "$ORCA/src/renderer/src/pb/"
cd "$ORCA"
eval "$(node --input-type=module -e '
import { appendBuildOldSpaceOption } from "./config/scripts/node-old-space-limit.mjs";
import { withRolldownThreadLimit } from "./config/scripts/rolldown-thread-limit.mjs";
const env = withRolldownThreadLimit(process.env);
const q = (v) => "\x27" + String(v).replaceAll("\x27", "\x27\\\x27\x27") + "\x27";
for (const [k, v] of Object.entries(env)) if (process.env[k] !== v) console.log("export " + k + "=" + q(v));
console.log("export NODE_OPTIONS=" + q(appendBuildOldSpaceOption(process.env.NODE_OPTIONS)));
')"
VITE="$ORCA/node_modules/vite/bin/vite.js"
step() { local name="$1"; shift; echo "build-probe: step $name"; echo "== $name" >> "$LOG"; local t0=$SECONDS; "$@" >> "$LOG" 2>&1 || fail "step $name exited $?"; echo "   $name ${SECONDS}s" >> "$LOG"; }
step probe-lib env PB_PROBE_TARGET=probe PB_SCOPE_CSS=1 node "$VITE" build --config vite.pb-probe-lib.config.ts
step spike-scoped env PB_PROBE_TARGET=spike-scoped PB_SCOPE_CSS=1 node "$VITE" build --config vite.pb-probe-lib.config.ts
rm -rf "$OUT/esm"
step esm env PB_HOST_REACT_DIR="$ROOT/theia/node_modules" PB_ESM_OUT="$OUT/esm" node "$VITE" build --config vite.pb-probe-esm.config.ts
cleanup
[ "$(tracked)" = "$BEFORE" ] || fail "A1: the build changed orca/'s tracked status"
MARKER=rendererPackageName
count() { { grep -o "$1" "$2" || true; } | wc -l | tr -d ' '; }
LIB="$ORCA/out/web/assets/pb-probe/pb-probe-lib.js"
[ -s "$LIB" ] || fail "probe lib not produced"
esm_js_bytes=$(find "$OUT/esm" -name '*.js' -printf '%s\n' | awk '{s+=$1} END {print s+0}')
esm_markers=$( (grep -rlo "$MARKER" "$OUT/esm" --include='*.js' || true) | wc -l | tr -d ' ')
esm_data=$( (grep -rho 'data:[a-z]*/[a-z0-9.+-]*;base64' "$OUT/esm" --include='*.js' --include='*.css' || true) | wc -l | tr -d ' ')
esm_entry=$(stat -c %s "$OUT/esm/pb-probe.js")
esm_files=$(find "$OUT/esm" -type f | wc -l | tr -d ' ')
echo "build-probe: PASS -- A1 tracked-unchanged; lib marker=$(count $MARKER "$LIB") lib-bytes=$(stat -c %s "$LIB") lib-data-urls=$(count 'data:[a-z]*/[a-z0-9.+-]*;base64' "$LIB") css-data-urls=$(count 'data:[a-z]*/[a-z0-9.+-]*;base64' "$ORCA/out/web/assets/pb-probe/pb-probe-lib.css"); esm entry-bytes=$esm_entry js-bytes=$esm_js_bytes files=$esm_files marker-files=$esm_markers data-urls=$esm_data"
