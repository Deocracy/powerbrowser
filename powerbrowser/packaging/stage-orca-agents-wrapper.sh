#!/usr/bin/env bash
# powerbrowser/packaging/stage-orca-agents-wrapper.sh -- stage the Claude Code process wrapper (63-CR-01).
#
#   bash powerbrowser/packaging/stage-orca-agents-wrapper.sh ROOT THEIA_STAGE
#
# The orca-agents backend finds the wrapper with
# require.resolve('@powerbrowser/orca-agents/bin/claude-wrapper.mjs'). esbuild leaves that call to
# Node at run time, and Node searches node_modules folders upward from the bundle at
# THEIA_STAGE/lib/backend/main.js. Without this file under THEIA_STAGE/node_modules the call throws,
# the backend offers no wrapper, and no Claude Code session gets an Orca pane or hook status. The
# package's package.json and its bin/claude-wrapper.mjs are copied, which is the layout the dev tree
# resolves through theia/node_modules, so the packaged and dev trees use one rule. The wrapper imports
# only node: built-ins, so nothing else from the package is needed.
#
# Called by package-linux.sh and package-macos.sh on the directory each stages as <GreD>/theia.
# The packaging-staging row resolves the specifier from a stage this script wrote.
set -euo pipefail
fail() { echo "stage-orca-agents-wrapper: FAIL -- $*" >&2; exit 1; }
[ "$#" -eq 2 ] || { echo "usage: bash powerbrowser/packaging/stage-orca-agents-wrapper.sh ROOT THEIA_STAGE" >&2; exit 2; }
SRC="$1/theia/extensions/orca-agents"
DEST="$2/node_modules/@powerbrowser/orca-agents"
test -f "$SRC/package.json" || fail "$SRC/package.json is absent"
test -f "$SRC/bin/claude-wrapper.mjs" || fail "$SRC/bin/claude-wrapper.mjs is absent"
test -d "$2/lib/backend" || fail "$2/lib/backend is absent; stage the sidecar's lib/ before the wrapper"
mkdir -p "$DEST/bin"
cp "$SRC/package.json" "$DEST/package.json"
cp "$SRC/bin/claude-wrapper.mjs" "$DEST/bin/claude-wrapper.mjs"
