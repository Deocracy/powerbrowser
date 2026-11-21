#!/usr/bin/env bash
# Phase 64 (TAB-04, TAB-06, TERM-01; P64-04, P64-08, P64-09, P64-24): build the Orca pane bundle
# with Orca's own Vite from the PB-added overlay files that scripts/build-orca.sh copied into
# orca/ (src/renderer/src/pb/pb-pane-mount.tsx, vite.pb-panes.config.ts, pb-css-scope.mjs).
# build-orca.sh runs it after build:web; it can also be run alone on a built tree.
#
# Usage, in the caller's shell (the Orca dev shell, as build-orca.sh's other steps):
#   bash scripts/build-orca-panes.sh               orca/out/web/assets/pb-panes/
#   bash scripts/build-orca-panes.sh --standalone  also the React-bundled variant in
#                                                  .mozbuild/orca-panes-standalone/
#
# Theia-independent and portable (68-01's hosted macOS jobs and 68-10's windows-orca run
# build-orca.sh with no Theia install and no Nix): it reads nothing under theia/, starts no nested
# Nix shell, uses bash 4 features at most, lists files with find piped through sed and
# LC_ALL=C sort, counts bytes with wc -c and needs no objdump. React's export names come from
# Orca's own React (PB_HOST_REACT_DIR stays unset here); the Theia side checks the version
# (orca-pane-entry) and the identity (the orca-panes loader, at run time).
#
# What it does, in order:
#   1. checks the shell (node 24, Orca's installed Vite) and the preconditions (a built web
#      client, every overlay file present and byte-equal in orca/)
#   2. scrubs every inherited ORCA_* variable and the Node variables, as build-orca.sh does
#   3. sets Orca's own build environment (rolldown thread limit, old-space option)
#   4. records orca/'s tracked status, empties out/web/assets/pb-panes/ (Vite's emptyOutDir),
#      builds, and requires the tracked status unchanged, pb-panes.js and pb-panes.css
#   5. --standalone: the same entry with React bundled (PB_PANES_STANDALONE=1)
# Last line: build-orca-panes: PASS -- <files> files, entry <bytes> bytes, css <bytes> bytes[, standalone <files> files]
#        or: build-orca-panes: FAIL -- <reason>
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ORCA="$REPO_ROOT/orca"
OVERLAY_FILES="$REPO_ROOT/orca-overlay/files"
OUT="$ORCA/out/web/assets/pb-panes"
STANDALONE_OUT="$REPO_ROOT/.mozbuild/orca-panes-standalone"

fail() {
  echo "build-orca-panes: FAIL -- $1"
  exit 1
}

standalone=0
for arg in "$@"; do
  case "$arg" in
    --standalone) standalone=1 ;;
    *) echo "build-orca-panes: unknown argument $arg" >&2; exit 2 ;;
  esac
done

# 1. Shell entry and preconditions.
node_major="$(node -p 'process.versions.node.split(".")[0]' 2>/dev/null || true)"
VITE="$ORCA/node_modules/vite/bin/vite.js"
if [ "$node_major" != "24" ] || [ ! -f "$VITE" ]; then
  fail "shell entry: need node 24 and Orca's installed Vite (orca/node_modules/vite); run inside the Orca dev shell after scripts/build-orca.sh (docs/BUILD.md \"Orca half\")"
fi
[ -f "$ORCA/out/web/web-index.html" ] || fail "orca/out/web/web-index.html is missing: run scripts/build-orca.sh"
overlay_list="$(cd "$OVERLAY_FILES" && find . -type f | sed 's|^\./||' | LC_ALL=C sort)"
[ -n "$overlay_list" ] || fail "orca-overlay/files is empty"
while IFS= read -r rel; do
  [ -n "$rel" ] || continue
  cmp -s "$OVERLAY_FILES/$rel" "$ORCA/$rel" || fail "orca/$rel is absent or differs from orca-overlay/files/$rel: run scripts/build-orca.sh --panes-only"
done <<< "$overlay_list"
[ -f "$ORCA/vite.pb-panes.config.ts" ] || fail "orca/vite.pb-panes.config.ts is missing: run scripts/build-orca.sh --panes-only"

# 2. Scrub, as build-orca.sh does.
for name in "${!ORCA_@}"; do unset "$name"; done
unset ELECTRON_RUN_AS_NODE NODE_OPTIONS NODE_REPL_EXTERNAL_MODULE PB_HOST_REACT_DIR PB_PANES_STANDALONE PB_PANES_OUT
export DO_NOT_TRACK=1

# 3. Orca's own build environment (its rolldown thread limit and old-space option).
cd "$ORCA"
# Captured first, evaluated second: the status of eval "$(cmd)" is the evaluated text's, so a node
# step that failed (a moved config/scripts/*.mjs after a re-pin) would otherwise eval "" and pass.
build_env="$(node --input-type=module -e '
import { appendBuildOldSpaceOption } from "./config/scripts/node-old-space-limit.mjs";
import { withRolldownThreadLimit } from "./config/scripts/rolldown-thread-limit.mjs";
const env = withRolldownThreadLimit(process.env);
const q = (v) => "\x27" + String(v).replaceAll("\x27", "\x27\\\x27\x27") + "\x27";
for (const [k, v] of Object.entries(env)) if (process.env[k] !== v) console.log("export " + k + "=" + q(v));
console.log("export NODE_OPTIONS=" + q(appendBuildOldSpaceOption(process.env.NODE_OPTIONS)));
')" || fail "could not read Orca's build environment (config/scripts)"
eval "$build_env"

# 4. The product bundle, on the host's React.
tracked() { git -C "$ORCA" status --porcelain --untracked-files=no; }
before="$(tracked)" || fail "git -C orca status failed"
# The baseline orca-pane-entry compares the built tree with (the staged seam paths, not empty).
mkdir -p "$REPO_ROOT/.mozbuild/orca-panes"
printf '%s\n' "$before" > "$REPO_ROOT/.mozbuild/orca-panes/tracked-baseline.txt"
node "$VITE" build --config vite.pb-panes.config.ts || fail "vite build --config vite.pb-panes.config.ts exited $?"
[ "$(tracked)" = "$before" ] || fail "the pane build changed orca/'s tracked status (A1)"
[ -s "$OUT/pb-panes.js" ] || fail "orca/out/web/assets/pb-panes/pb-panes.js was not produced"
[ -s "$OUT/pb-panes.css" ] || fail "orca/out/web/assets/pb-panes/pb-panes.css was not produced"
css_count="$(cd "$OUT" && find . -type f -name '*.css' | wc -l | tr -d ' ')"
[ "$css_count" = "1" ] || fail "pb-panes/ holds $css_count stylesheets, expected 1 (cssCodeSplit off)"
files="$(cd "$OUT" && find . -type f | wc -l | tr -d ' ')"
summary="$files files, entry $(wc -c < "$OUT/pb-panes.js" | tr -d ' ') bytes, css $(wc -c < "$OUT/pb-panes.css" | tr -d ' ') bytes"

# 5. The React-bundled variant (the standalone page and the two-copy control).
if [ "$standalone" = 1 ]; then
  PB_PANES_STANDALONE=1 PB_PANES_OUT="$STANDALONE_OUT" node "$VITE" build --config vite.pb-panes.config.ts \
    || fail "standalone vite build exited $?"
  [ "$(tracked)" = "$before" ] || fail "the standalone build changed orca/'s tracked status (A1)"
  [ -s "$STANDALONE_OUT/pb-panes.js" ] || fail ".mozbuild/orca-panes-standalone/pb-panes.js was not produced"
  summary="$summary, standalone $(cd "$STANDALONE_OUT" && find . -type f | wc -l | tr -d ' ') files"
fi

echo "build-orca-panes: PASS -- $summary"
