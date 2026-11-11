#!/usr/bin/env bash
# Phase 66 (BRW-03; P66-02, P66-30): build the thin browser host, pb-browser-host.js, with Orca's own Vite from the
# PB-added overlay files that scripts/build-orca.sh copied into orca/
# (src/renderer/src/pb/browser-host/pb-browser-host.ts, vite.pb-browser-host.config.ts).
# build-orca.sh runs it right after the pane-bundle step, on the full path and on --panes-only alike, because the
# pane step empties the pane output directory; it can also be run alone on a built tree.
#
# Usage, in the caller's shell (the Orca dev shell, as build-orca.sh's other steps):
#   bash scripts/build-orca-browser-host.sh
#
# Inputs: orca/ with the overlay copied and Orca's Vite installed; the pane output directory, read from the outDir of
# orca-overlay/files/vite.pb-panes.config.ts (Phase 64 C1), the directory the Theia backend's pane-bundle route serves.
# Outputs: <pane output dir>/pb-browser-host.js; orca/out/pb-browser-host-meta/modules.json (the module id list) and
# orca/out/pb-browser-host-meta/tracked-before.txt (orca/'s tracked status just before Vite ran), both ignored and
# outside the served directory, read by scripts/verify-orca-browser-host-bundle.mjs.
# Never edits a tracked Orca file: the tracked status after the build must equal the one recorded before it.
#
# Portable like build-orca-panes.sh (68-01): no nested Nix shell, bash 4 features at most, no GNU find format
# option, sizes by wc -c.
# Last line: build-orca-browser-host: PASS -- <bytes> bytes
#        or: build-orca-browser-host: FAIL -- <reason>
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ORCA="$REPO_ROOT/orca"
PANES_CONFIG="$REPO_ROOT/orca-overlay/files/vite.pb-panes.config.ts"
META="$ORCA/out/pb-browser-host-meta"

fail() {
  echo "build-orca-browser-host: FAIL -- $1"
  exit 1
}

[ "$#" -eq 0 ] || { echo "build-orca-browser-host: unknown argument $1" >&2; exit 2; }

# 1. Shell entry and preconditions.
node_major="$(node -p 'process.versions.node.split(".")[0]' 2>/dev/null || true)"
VITE="$ORCA/node_modules/vite/bin/vite.js"
if [ "$node_major" != "24" ] || [ ! -f "$VITE" ]; then
  fail "shell entry: need node 24 and Orca's installed Vite (orca/node_modules/vite); run inside the Orca dev shell after scripts/build-orca.sh"
fi
for rel in vite.pb-browser-host.config.ts src/renderer/src/pb/browser-host/pb-browser-host.ts; do
  cmp -s "$REPO_ROOT/orca-overlay/files/$rel" "$ORCA/$rel" || fail "orca/$rel is absent or differs from orca-overlay/files/$rel: run scripts/build-orca.sh --panes-only"
done

# 2. The served directory: the pane config's default outDir, 'out/web/assets/pb-panes' (relative to orca/).
out_rel="$(sed -n "s#.*outDir: resolve(process.env.PB_PANES_OUT || '\([^']*\)').*#\1#p" "$PANES_CONFIG")"
[ -n "$out_rel" ] || fail "no outDir: resolve(process.env.PB_PANES_OUT || '...') line in orca-overlay/files/vite.pb-panes.config.ts (the pane config moved)"
OUT="$ORCA/$out_rel"
[ -s "$OUT/pb-panes.js" ] || fail "orca/$out_rel/pb-panes.js is missing: the pane-bundle step must run first"

# 3. Scrub, as build-orca.sh does.
for name in "${!ORCA_@}"; do unset "$name"; done
unset ELECTRON_RUN_AS_NODE NODE_OPTIONS NODE_REPL_EXTERNAL_MODULE PB_BROWSER_HOST_OUT PB_BROWSER_HOST_META
export DO_NOT_TRACK=1

# 4. Build, with orca/'s tracked status recorded before and required unchanged after.
cd "$ORCA"
tracked() { git -C "$ORCA" status --porcelain --untracked-files=no; }
before="$(tracked)" || fail "git -C orca status failed"
mkdir -p "$META"
printf '%s\n' "$before" > "$META/tracked-before.txt"
rm -f "$OUT/pb-browser-host.js" "$META/modules.json"
PB_BROWSER_HOST_OUT="$OUT" PB_BROWSER_HOST_META="$META" node "$VITE" build --config vite.pb-browser-host.config.ts \
  || fail "vite build --config vite.pb-browser-host.config.ts exited $?"
[ "$(tracked)" = "$before" ] || fail "the host build changed orca/'s tracked status"
[ -s "$OUT/pb-browser-host.js" ] || fail "orca/$out_rel/pb-browser-host.js was not produced"
[ -s "$META/modules.json" ] || fail "orca/out/pb-browser-host-meta/modules.json was not produced"

echo "build-orca-browser-host: PASS -- $(wc -c < "$OUT/pb-browser-host.js" | tr -d ' ') bytes"
