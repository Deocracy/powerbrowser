#!/usr/bin/env bash
# Makes a fresh fix-lane worktree able to build the Theia extensions and run the
# quick gate, by copy-on-write copying the untracked build directories from the
# integration worktree. /home is btrfs, so the copies share extents and cost no space.
#
# usage (from the root of the lane worktree):
#   bash .planning/workstreams/orca/audit-fix/provision-lane.sh [--with-objdir]
#
# --with-objdir also copies the Gecko object directory. It is large in file count;
# pass it only when a check you must run reads objdir/.
set -euo pipefail

SRC="${PB_LANE_SOURCE:-/home/chris/orca/workspaces/Power-Browser/v1.7-Orca-integration}"
DST="$(git rev-parse --show-toplevel)"

if [ "$(realpath "$DST")" = "$(realpath "$SRC")" ]; then
  echo "provision-lane: refusing to run in the integration worktree ($SRC)" >&2
  exit 1
fi
case "$DST" in *" "*) echo "provision-lane: the worktree path contains a space; native links would fail" >&2; exit 1 ;; esac

copy() {
  local rel="$1"
  [ -e "$SRC/$rel" ] || return 0
  if [ -e "$DST/$rel" ]; then echo "  kept     $rel"; return 0; fi
  mkdir -p "$(dirname "$DST/$rel")"
  cp -a --reflink=auto "$SRC/$rel" "$DST/$rel"
  echo "  copied   $rel"
}

start=$(date +%s)
for rel in generated upstream orca .mozbuild powerbrowser/branding-generated \
           theia/node_modules \
           theia/applications/browser/node_modules theia/applications/browser/lib \
           theia/applications/browser/plugins theia/applications/browser/src-gen \
           theia/applications/browser/gen-esbuild.browser.mjs theia/applications/browser/gen-esbuild.node.mjs; do
  copy "$rel"
done
for dir in "$SRC"/theia/extensions/*/; do
  name="$(basename "$dir")"
  copy "theia/extensions/$name/lib"
  copy "theia/extensions/$name/tsconfig.tsbuildinfo"
  copy "theia/extensions/$name/node_modules"
done
if [ "${1:-}" = "--with-objdir" ]; then copy objdir; fi

# A relative link that leaves the worktree (the corepack shims point into /nix/store
# through nine `..` segments) resolves from the integration worktree's depth only.
# Re-point each link that is broken here at the path it resolves to there.
relinked=0
while IFS= read -r -d '' link; do
  rel="${link#"$DST"/}"
  target="$(realpath -e "$SRC/$rel" 2>/dev/null || true)"
  if [ -n "$target" ]; then ln -sfn "$target" "$link"; relinked=$((relinked + 1)); fi
done < <(find "$DST/.mozbuild" -xtype l -print0 2>/dev/null)
echo "  relinked $relinked link(s) under .mozbuild that pointed outside the worktree"

# The copied build outputs match the integration worktree's sources at copy time.
# Rebuild the extensions so lib/ matches this worktree's sources.
echo "provision-lane: done in $(( $(date +%s) - start )) s. Next: nix develop .#theia --command bash -c 'cd theia && yarn build:extensions'"
