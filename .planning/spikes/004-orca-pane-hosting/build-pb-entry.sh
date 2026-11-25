#!/usr/bin/env bash
# Spike 004 (TAB-03, P61-12): build the PB-added pane entry with Orca's own Vite, beside Orca's
# untouched web build, and answer two assumptions with measurements.
#
#   A1  a PB-added config that mergeConfigs orca/vite.web.config.ts builds an extra page and a
#       library bundle with zero edits to any file Orca's git tracks.
#   A4  the library bundle carries no React of its own when react, react-dom, react-dom/client
#       and react/jsx-runtime are externals; a two-copy control build proves the marker counts.
#
# Run from the repo root inside the Orca dev shell, after scripts/build-orca.sh:
#   nix develop .#orca --command bash .planning/spikes/004-orca-pane-hosting/build-pb-entry.sh
#
# Outputs land under orca/out/web/assets/ (pb/pb-pane.html, pb-lib/): orcad's static handler
# serves /web-index.html and four asset subtrees only, so a page beside web-index.html is a 404.
#
# PB's inputs are copied into orca/ as untracked files and removed on exit. Vite is started the
# way orca/config/scripts/run-vite-web-build.mjs starts it (node + vite's own bin, the same
# thread limit and heap option), with --config naming the PB file.
# Last line: build-pb-entry: PASS -- <counts>   or   build-pb-entry: FAIL -- <assertion>
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$HERE/../../.." && pwd)"
ORCA="$REPO_ROOT/orca"
TWO_COPY_DIR="$REPO_ROOT/.mozbuild/p61-01/pb-lib-two-copy"
LOG_DIR="$REPO_ROOT/.mozbuild/p61-01"
mkdir -p "$LOG_DIR"
LOG="$LOG_DIR/build-pb-entry.log"
: > "$LOG"

COPIED=(
  "vite.pb.config.ts"
  "vite.pb-lib.config.ts"
  "src/renderer/assets/pb/pb-pane.html"
  "src/renderer/src/pb/pb-pane.tsx"
  "src/renderer/src/pb/pb-pane-mount.tsx"
)

cleanup() {
  for rel in "${COPIED[@]}"; do rm -f "$ORCA/$rel"; done
  rmdir "$ORCA/src/renderer/src/pb" "$ORCA/src/renderer/assets/pb" "$ORCA/src/renderer/assets" 2>/dev/null || true
}
trap cleanup EXIT

fail() {
  cleanup
  echo "build-pb-entry: FAIL -- $1; log $LOG"
  exit 1
}

tracked_dirty() { git -C "$ORCA" status --porcelain --untracked-files=no; }

[ -f "$ORCA/out/web/web-index.html" ] || fail "precondition: orca/out/web/web-index.html is missing, run scripts/build-orca.sh first"
[ -z "$(tracked_dirty)" ] || fail "precondition: orca/ has modified tracked files before the build"
[ "$(node -p 'process.versions.node.split(".")[0]')" = "24" ] || fail "shell entry: need node 24, run inside nix develop .#orca"

# This tree is worked on from inside Orca desktop; its variables must not reach the build.
for name in "${!ORCA_@}"; do unset "$name"; done
unset ELECTRON_RUN_AS_NODE NODE_OPTIONS NODE_REPL_EXTERNAL_MODULE
export DO_NOT_TRACK=1

[ ! -e "$ORCA/src/renderer/assets" ] || fail "precondition: orca/src/renderer/assets exists; the pane page would land in an Orca directory"
mkdir -p "$ORCA/src/renderer/src/pb" "$ORCA/src/renderer/assets/pb"
cp "$HERE/vite.pb.config.ts" "$HERE/vite.pb-lib.config.ts" "$ORCA/"
cp "$HERE/pb-pane.html" "$ORCA/src/renderer/assets/pb/"
cp "$HERE/pb-pane.tsx" "$HERE/pb-pane-mount.tsx" "$ORCA/src/renderer/src/pb/"

cd "$ORCA"
# The environment run-vite-web-build.mjs sets, from Orca's own helpers.
eval "$(node --input-type=module -e '
import { appendBuildOldSpaceOption } from "./config/scripts/node-old-space-limit.mjs";
import { withRolldownThreadLimit } from "./config/scripts/rolldown-thread-limit.mjs";
const env = withRolldownThreadLimit(process.env);
const q = (v) => "\x27" + String(v).replaceAll("\x27", "\x27\\\x27\x27") + "\x27";
for (const [k, v] of Object.entries(env)) if (process.env[k] !== v) console.log("export " + k + "=" + q(v));
console.log("export NODE_OPTIONS=" + q(appendBuildOldSpaceOption(process.env.NODE_OPTIONS)));
')"
VITE="$ORCA/node_modules/vite/bin/vite.js"

vite_build() {
  local name="$1"; shift
  echo "build-pb-entry: step $name"
  echo "== $name" >> "$LOG"
  "$@" >> "$LOG" 2>&1 || fail "step $name exited $?"
}

vite_build app node "$VITE" build --config vite.pb.config.ts
vite_build lib node "$VITE" build --config vite.pb-lib.config.ts
rm -rf "$TWO_COPY_DIR"
vite_build lib-two-copy env PB_LIB_TWO_COPY=1 node "$VITE" build --config vite.pb-lib.config.ts

cleanup

# A1.
[ -z "$(tracked_dirty)" ] || fail "A1: the build modified a file tracked by Orca's git: $(tracked_dirty | head -3)"
untracked="$(git -C "$ORCA" status --porcelain)"
for rel in "${COPIED[@]}"; do
  if printf '%s\n' "$untracked" | grep -qF "$rel"; then fail "A1: copied input $rel is still in orca/"; fi
done
if printf '%s\n' "$untracked" | grep -qE 'src/renderer/(src/pb|assets)/?'; then fail "A1: a directory the script made is still in orca/"; fi
for out in out/web/web-index.html out/web/assets/pb/pb-pane.html out/web/assets/pb-lib/pb-pane-lib.js; do
  [ -s "$ORCA/$out" ] || fail "A1: $out was not produced"
done
ls "$ORCA"/out/web/assets/pb-lib/*.css >/dev/null 2>&1 || fail "A1: out/web/assets/pb-lib has no stylesheet"
node config/scripts/verify-web-build.mjs >> "$LOG" 2>&1 || fail "A1: Orca's verify-web-build.mjs rejects out/web"
if grep -Eq '(src|href)=["'"'"']/' "$ORCA/out/web/assets/pb/pb-pane.html"; then fail "A1: pb-pane.html has an absolute URL"; fi

# A4 static. The marker is derived from Theia's react-dom at check time: a property name its
# production client build passes to the DevTools hook, which a minifier cannot rename.
THEIA_REACT_DOM="$REPO_ROOT/theia/node_modules/react-dom"
MARKER="rendererPackageName"
react_version="$(node -p 'require(process.argv[1]).version' "$THEIA_REACT_DOM/package.json" 2>/dev/null || true)"
[ -n "$react_version" ] || fail "A4: theia/node_modules/react-dom is missing (run the audited Theia install)"
grep -q "$MARKER" "$THEIA_REACT_DOM/cjs/react-dom-client.production.js" || fail "A4: marker $MARKER is not in Theia's react-dom client build, so it cannot be derived"
orca_react_version="$(node -p 'require(process.argv[1]).version' "$ORCA/node_modules/react-dom/package.json")"
# grep exits 1 on zero matches, which is the expected externals result, not an error.
count() { { grep -o "$MARKER" "$1" || true; } | wc -l | tr -d ' '; }
control="$(count "$TWO_COPY_DIR/pb-pane-lib.js")"
externals="$(count "$ORCA/out/web/assets/pb-lib/pb-pane-lib.js")"
[ "$control" -ge 1 ] || fail "A4: the two-copy control bundle has 0 $MARKER markers, so the counter proves nothing"
[ "$externals" -eq 0 ] || fail "A4: the externals bundle still carries $externals $MARKER marker(s): React was bundled"
size() { stat -c %s "$1"; }

echo "build-pb-entry: PASS -- A1 tracked-dirty=0 pages=web-index.html,assets/pb/pb-pane.html; A4 marker=$MARKER control=$control externals=$externals; react-dom theia=$react_version orca=$orca_react_version; lib bytes externals=$(size "$ORCA/out/web/assets/pb-lib/pb-pane-lib.js") two-copy=$(size "$TWO_COPY_DIR/pb-pane-lib.js")"
