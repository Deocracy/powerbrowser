#!/usr/bin/env bash
# AUTO-10: "patches are regenerated, never text-edited" (CLAUDE.md) as a gate.
#
# A hunk body edited by hand without recomputing its blob hashes degrades
# `git apply --3way` into a silent no-op. --check re-derives every tracked
# patch from the applied upstream/ and byte-compares it, so a hand edit goes
# red naming the patch.
#
# CR-01 (phase 40 review): an ESR bump moves upstream/ under the patches. A
# clean --3way replay onto a moved file changes the patch's `index` line, its
# @@ ranges and its context lines on its own, so a byte compare there would
# call a clean replay a hand edit. --check therefore compares per file:
#  - a file whose pre-image blob in the tracked patch equals the replayed
#    tree's (upstream did not move it) is compared byte for byte;
#  - a file upstream moved is compared on its +/- lines only, with the index
#    line, the @@ lines and the context lines stripped -- what a hand edit or a
#    silent no-op replay changes and a clean replay does not. A match is a
#    NOTE naming the file: regenerate and commit the patch with the pin bump.
#
# The diff is taken against HEAD, not the worktree alone: apply-patches.sh's
# --3way stages its result into the index, so a worktree-only diff is empty.
# Modes: no flag regenerates every patch in place (write); --check compares;
# --self-test runs the hermetic fixture. --upstream/--patches override the
# default directories.
#
# Output bytes are pinned: user/system git config off, abbrev 10, myers, no
# external diff, no textconv, no color. Never --full-index (the tracked
# patches carry 10-character abbreviations).
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
UPSTREAM_DIR="$REPO_ROOT/upstream"
PATCHES_DIR="$REPO_ROOT/patches"
SELF="$REPO_ROOT/scripts/regenerate-patches.sh"

usage() {
  echo "usage: regenerate-patches.sh [--check | --self-test] [--upstream <dir>] [--patches <dir>]" >&2
}

fail() {
  echo "regenerate-patches: FAIL -- $1" >&2
  [ -n "${2:-}" ] && echo "  Next step: $2" >&2
  exit 1
}

# Prints the patch's own paths, in file order, once each: both sides of every
# 'diff --git a/X b/Y' header, so a deletion (+++ /dev/null) and a rename are
# covered (WR-01).
patch_paths() {
  awk '/^diff --git /{a=$3; b=$4; sub(/^a\//,"",a); sub(/^b\//,"",b)
    if (!(a in seen)) {seen[a]=1; print a}; if (!(b in seen)) {seen[b]=1; print b}}' "$1"
}

# WR-01: refuses a regeneration ($2) that lost a path of the tracked patch
# ($1) -- the path has no change in upstream/, so its hunks would vanish
# without a word. $3 is appended to the failure.
check_kept() {
  local path name
  name="$(basename "$1")"
  while IFS= read -r path; do
    patch_paths "$2" | grep -qxF -- "$path" \
      || fail "regenerating $name dropped $path: $path is unchanged in upstream/ (a hunk was resolved away during --3way, or apply-patches.sh missed that file)$3" \
        "restore the change to $path in upstream/ (bash scripts/apply-patches.sh), then re-run"
  done < <(patch_paths "$1")
}

# Prints "<path> <pre-image blob>" for each file section of a patch.
preimages() {
  awk '/^diff --git /{p=$4; sub(/^b\//,"",p)} /^index /{split($2,h,/\.\./); print p, h[1]}' "$1"
}

# Prints a patch with the index, @@ and context lines removed from the file
# sections named in $2 (space-separated paths); every +/- line and every file
# header stays. Those three are what a clean --3way replay onto a moved file
# rewrites by itself.
normalise() {
  awk -v moved=" $2 " '/^diff --git /{p=$4; sub(/^b\//,"",p); strip=index(moved, " " p " ")>0; print; next}
    strip && (/^index / || /^@@ / || /^ /) {next} {print}' "$1"
}

# Prints the regeneration of one tracked patch on stdout. Shared by every mode
# and by --self-test, so the fixture exercises the exact logic the real tree
# is gated by.
regenerate_one() {
  local p="$1" paths
  paths="$(patch_paths "$p")"
  # shellcheck disable=SC2086 # one path per line, none contains a space
  GIT_CONFIG_GLOBAL=/dev/null GIT_CONFIG_NOSYSTEM=1 git -C "$UPSTREAM_DIR" -c core.abbrev=10 \
    diff --no-ext-diff --no-color --no-textconv --diff-algorithm=myers --abbrev=10 HEAD -- $paths
}

# Validates the inputs every mode depends on and fills the global patch_files
# array in sorted filename order.
preflight() {
  if [ ! -d "$UPSTREAM_DIR" ] || ! git -C "$UPSTREAM_DIR" rev-parse --verify -q HEAD >/dev/null 2>&1; then
    fail "$UPSTREAM_DIR is absent or not a git checkout" \
      "bash scripts/fetch-upstream.sh && bash scripts/apply-patches.sh"
  fi

  shopt -s nullglob
  patch_files=("$PATCHES_DIR"/*.patch)
  shopt -u nullglob
  [ "${#patch_files[@]}" -gt 0 ] || fail "$PATCHES_DIR contains no *.patch files"

  local p name path
  declare -A owner=()
  for p in "${patch_files[@]}"; do
    name="$(basename "$p")"
    [ -n "$(patch_paths "$p")" ] || fail "$name has no 'diff --git' file header, so it names no path to regenerate"
    while IFS= read -r path; do
      if [ -n "${owner[$path]:-}" ]; then
        fail "${owner[$path]} and $name both name $path; regeneration cannot split one file's hunks between two patches" \
          "move every hunk for $path into one patch"
      fi
      owner[$path]="$name"
    done < <(patch_paths "$p")
  done
}

run_check() {
  preflight
  local p name moved drifted=0
  tmp="$(mktemp -d)" # global: the EXIT trap runs after this function's locals are gone
  trap 'rm -rf "$tmp"' EXIT
  for p in "${patch_files[@]}"; do
    name="$(basename "$p")"
    regenerate_one "$p" > "$tmp/$name"
    [ -s "$tmp/$name" ] || fail "regenerating $name produced nothing: upstream/ is pristine or unpatched" \
      "bash scripts/apply-patches.sh"
    check_kept "$p" "$tmp/$name" ""
    cmp -s "$tmp/$name" "$p" && continue
    # The files whose pre-image blob differs: upstream moved them under the patch.
    moved="$(awk 'NR==FNR{t[$1]=$2; next} t[$1]!=$2{print $1}' <(preimages "$p") <(preimages "$tmp/$name") | tr '\n' ' ')"
    moved="${moved% }"
    if [ -z "$moved" ]; then
      fail "$name differs from its regeneration from upstream/, and upstream/ has the same files it was generated from: a hunk was edited by hand, or upstream/ was not replayed with apply-patches.sh" \
        "regenerate it with bash scripts/regenerate-patches.sh from a correctly patched upstream/"
    fi
    if ! cmp -s <(normalise "$tmp/$name" "$moved") <(normalise "$p" "$moved"); then
      fail "$name's added or removed lines differ from its regeneration from upstream/: a hunk was edited by hand, or the replay onto the moved upstream file(s) $moved changed what the patch does" \
        "inspect the replayed upstream/, then regenerate it with bash scripts/regenerate-patches.sh"
    fi
    echo "regenerate-patches: NOTE -- $name replays onto upstream file(s) that moved since it was generated ($moved); its added and removed lines match. Next step: run bash scripts/regenerate-patches.sh and commit the result with the pin bump."
    drifted=$((drifted + 1))
  done
  echo "regenerate-patches: PASS -- ${#patch_files[@]} patch(es) equal their regeneration from upstream/ ($drifted on moved upstream files, compared on their added and removed lines)"
}

# Write mode: the only sanctioned way a patch changes. Every patch is
# regenerated into a temp file beside it and validated before any is replaced,
# and a replacement is a rename, so a refusal leaves every tracked patch's
# bytes unchanged (never written in place, never truncated first).
run_write() {
  preflight
  local p name t
  declare -A regen=()
  regen_tmps=() # global: read by the EXIT trap
  trap 'rm -f "${regen_tmps[@]}"' EXIT
  for p in "${patch_files[@]}"; do
    name="$(basename "$p")"
    t="$(mktemp "$PATCHES_DIR/.regenerate.XXXXXX")"
    regen_tmps+=("$t")
    regen[$p]="$t"
    regenerate_one "$p" > "$t"
    [ -s "$t" ] || fail "regenerating $name produced nothing: upstream/ is pristine or unpatched; $name was left unchanged" \
      "bash scripts/apply-patches.sh"
    [ "$(head -c 13 "$t")" = "diff --git a/" ] || fail "regenerating $name did not produce a git diff; $name was left unchanged"
    check_kept "$p" "$t" "; $name was left unchanged"
  done
  for p in "${patch_files[@]}"; do
    name="$(basename "$p")"
    if cmp -s "${regen[$p]}" "$p"; then
      echo "regenerate-patches: unchanged $name"
    else
      chmod --reference="$p" "${regen[$p]}"
      mv -f "${regen[$p]}" "$p"
      echo "regenerate-patches: rewrote $name"
    fi
  done
}

# Hermetic: a throwaway fixture repo whose change is staged the way --3way
# leaves upstream/, and fixture patches produced by regenerate_one itself.
# Every case invokes this script as a child, as the real gate does.
run_self_test() {
  local fx failed=0 out rc
  fx="$(mktemp -d)"
  tmp="$fx" # global: read by the EXIT trap
  trap 'rm -rf "$tmp"' EXIT
  export GIT_CONFIG_GLOBAL=/dev/null GIT_CONFIG_NOSYSTEM=1

  mkdir -p "$fx/up" "$fx/seed" "$fx/p"
  printf 'alpha\nbeta\ngamma\ndelta\n' > "$fx/up/one.txt"
  printf 'red\ngreen\nblue\n' > "$fx/up/two.txt"
  git -C "$fx/up" init -q
  git -C "$fx/up" add one.txt two.txt
  git -C "$fx/up" -c user.name=self-test -c user.email=self-test@invalid commit -q -m fixture
  printf 'alpha\nbeta changed\ngamma\ndelta\nepsilon\n' > "$fx/up/one.txt"
  printf 'red\ngreen\ncyan\n' > "$fx/up/two.txt"
  git -C "$fx/up" add one.txt two.txt
  cp -r "$fx/up" "$fx/pristine"
  git -C "$fx/pristine" reset -q --hard

  echo 'diff --git a/one.txt b/one.txt' > "$fx/seed/A.patch"
  echo 'diff --git a/two.txt b/two.txt' > "$fx/seed/B.patch"
  (UPSTREAM_DIR="$fx/up"; regenerate_one "$fx/seed/A.patch") > "$fx/p/010-a.patch"
  (UPSTREAM_DIR="$fx/up"; regenerate_one "$fx/seed/B.patch") > "$fx/p/020-b.patch"

  # Runs the script as a child into $out / $rc without tripping set -e.
  run_child() { if out="$(bash "$SELF" "$@" 2>&1)"; then rc=0; else rc=$?; fi; }
  pass() { echo "regenerate-patches: --self-test PASS -- $1"; }
  red() { echo "regenerate-patches: --self-test FAIL -- $1" >&2; echo "$out" | sed 's/^/    /' >&2; failed=1; }

  # 1. control
  run_child --check --upstream "$fx/up" --patches "$fx/p"
  if [ "$rc" -eq 0 ]; then
    pass "control: two fixture patches regenerated from the staged fixture pass --check"
  else
    red "control: fixture patches do not pass --check, so planted-fault results would mean nothing"
    return 1
  fi

  # 2. hand-edited hunk body
  cp -r "$fx/p" "$fx/edited"
  sed -i 's/^+epsilon$/+epsilon edited by hand/' "$fx/edited/010-a.patch"
  run_child --check --upstream "$fx/up" --patches "$fx/edited"
  if [ "$rc" -ne 0 ] && [[ "$out" == *010-a.patch* ]] && [[ "$out" != *020-b.patch* ]]; then
    pass "a hand-edited + line in 010-a.patch goes red naming 010-a.patch only"
  else
    red "a hand-edited + line in 010-a.patch did not go red naming 010-a.patch only (rc=$rc)"
  fi

  # 3. pristine upstream
  run_child --check --upstream "$fx/pristine" --patches "$fx/p"
  if [ "$rc" -ne 0 ] && [[ "$out" == *010-a.patch* ]] && [[ "$out" == *apply-patches.sh* ]]; then
    pass "a pristine upstream fails naming 010-a.patch with the apply-patches.sh next step"
  else
    red "a pristine upstream did not fail naming 010-a.patch with the apply-patches.sh next step (rc=$rc)"
  fi

  # 4. adjacency
  cp -r "$fx/p" "$fx/adjacent"
  cp "$fx/p/010-a.patch" "$fx/adjacent/030-c.patch"
  run_child --check --upstream "$fx/up" --patches "$fx/adjacent"
  if [ "$rc" -ne 0 ] && [[ "$out" == *010-a.patch* ]] && [[ "$out" == *030-c.patch* ]]; then
    pass "two patches naming one.txt fail naming 010-a.patch and 030-c.patch"
  else
    red "two patches naming one.txt did not fail naming both patches (rc=$rc)"
  fi

  # 5. write mode refuses on a pristine upstream and leaves the patch bytes alone
  cp -r "$fx/p" "$fx/refuse"
  local before after
  before="$(sha256sum < "$fx/refuse/010-a.patch")"
  run_child --upstream "$fx/pristine" --patches "$fx/refuse"
  after="$(sha256sum < "$fx/refuse/010-a.patch")"
  if [ "$rc" -ne 0 ] && [ "$before" = "$after" ] && [ -z "$(find "$fx/refuse" -name '.regenerate.*')" ]; then
    pass "write mode on a pristine upstream refuses and 010-a.patch's sha256 is unchanged"
  else
    red "write mode on a pristine upstream did not refuse cleanly (rc=$rc, sha256 changed: $([ "$before" = "$after" ] && echo no || echo yes))"
  fi

  # 6. write mode rewrites a stale patch so --check passes
  cp -r "$fx/edited" "$fx/stale"
  run_child --upstream "$fx/up" --patches "$fx/stale"
  local wrote="$out" wrc="$rc"
  run_child --check --upstream "$fx/up" --patches "$fx/stale"
  if [ "$wrc" -eq 0 ] && [[ "$wrote" == *"rewrote 010-a.patch"* ]] && [[ "$wrote" == *"unchanged 020-b.patch"* ]] && [ "$rc" -eq 0 ]; then
    pass "write mode rewrites the stale 010-a.patch and --check then passes"
  else
    out="$wrote"$'\n'"$out"
    red "write mode did not rewrite the stale 010-a.patch into a passing state (write rc=$wrc, check rc=$rc)"
  fi

  # 7. CR-01: a clean --3way replay onto a moved upstream passes. "moved" is
  # the pristine fixture with one upstream commit that shifts one.txt's @@
  # range and context; two.txt is unmoved and stays byte-compared.
  cp -r "$fx/pristine" "$fx/moved"
  printf 'zero\nalpha\nbeta\ngamma\ndelta\n' > "$fx/moved/one.txt"
  git -C "$fx/moved" -c user.name=self-test -c user.email=self-test@invalid commit -q -am "upstream moves one.txt"
  git -C "$fx/moved" apply --3way "$fx/p/010-a.patch" "$fx/p/020-b.patch" 2>/dev/null
  run_child --check --upstream "$fx/moved" --patches "$fx/p"
  if [ "$rc" -eq 0 ] && [[ "$out" == *"NOTE -- 010-a.patch"* ]] && [[ "$out" != *"NOTE -- 020-b.patch"* ]]; then
    pass "a clean --3way replay onto a moved upstream passes, with a regenerate NOTE naming 010-a.patch only"
  else
    red "a clean --3way replay onto a moved upstream did not pass with a NOTE naming 010-a.patch only (rc=$rc)"
  fi

  # 8. CR-01: a hand-edited hunk still fails on the moved upstream
  run_child --check --upstream "$fx/moved" --patches "$fx/edited"
  if [ "$rc" -ne 0 ] && [[ "$out" == *010-a.patch* ]] && [[ "$out" == *"edited by hand"* ]]; then
    pass "a hand-edited + line in 010-a.patch still goes red on the moved upstream"
  else
    red "a hand-edited + line in 010-a.patch did not go red on the moved upstream (rc=$rc)"
  fi

  # 9. WR-01: a two-file patch whose second file is unchanged upstream is
  # refused by write mode (bytes unchanged) and by --check, naming that file.
  mkdir -p "$fx/two-file"
  cat "$fx/seed/A.patch" "$fx/seed/B.patch" > "$fx/seed/AB.patch"
  (UPSTREAM_DIR="$fx/up"; regenerate_one "$fx/seed/AB.patch") > "$fx/two-file/050-ab.patch"
  cp -r "$fx/pristine" "$fx/half"
  cp "$fx/up/one.txt" "$fx/half/one.txt"
  git -C "$fx/half" add one.txt
  before="$(sha256sum < "$fx/two-file/050-ab.patch")"
  run_child --upstream "$fx/half" --patches "$fx/two-file"
  local half_out="$out" half_rc="$rc"
  after="$(sha256sum < "$fx/two-file/050-ab.patch")"
  run_child --check --upstream "$fx/half" --patches "$fx/two-file"
  if [ "$half_rc" -ne 0 ] && [[ "$half_out" == *"dropped two.txt"* ]] && [ "$before" = "$after" ] \
    && [ "$rc" -ne 0 ] && [[ "$out" == *"dropped two.txt"* ]]; then
    pass "a two-file patch with two.txt unchanged upstream is refused by write mode (bytes unchanged) and --check, naming two.txt"
  else
    out="$half_out"$'\n'"$out"
    red "a two-file patch with two.txt unchanged upstream was not refused naming two.txt (write rc=$half_rc, check rc=$rc)"
  fi

  # 10. WR-01: a patch that changes one file and deletes another keeps the
  # deletion through --check and write mode.
  mkdir -p "$fx/del-p"
  cp -r "$fx/pristine" "$fx/del"
  cp "$fx/up/one.txt" "$fx/del/one.txt"
  git -C "$fx/del" add one.txt
  git -C "$fx/del" rm -q two.txt
  (UPSTREAM_DIR="$fx/del"; regenerate_one "$fx/seed/AB.patch") > "$fx/del-p/060-del.patch"
  run_child --upstream "$fx/del" --patches "$fx/del-p"
  local del_out="$out" del_rc="$rc"
  run_child --check --upstream "$fx/del" --patches "$fx/del-p"
  if [ "$del_rc" -eq 0 ] && [[ "$del_out" == *"unchanged 060-del.patch"* ]] && [ "$rc" -eq 0 ] \
    && grep -qx '+++ /dev/null' "$fx/del-p/060-del.patch"; then
    pass "a patch that deletes two.txt keeps the deletion through write mode and --check"
  else
    out="$del_out"$'\n'"$out"
    red "a patch that deletes two.txt did not keep the deletion (write rc=$del_rc, check rc=$rc)"
  fi

  return "$failed"
}

MODE=""
while [ $# -gt 0 ]; do
  case "$1" in
    --check) MODE=check; shift ;;
    --self-test) MODE=self-test; shift ;;
    --upstream) [ $# -ge 2 ] || { usage; exit 2; }; UPSTREAM_DIR="$2"; shift 2 ;;
    --patches) [ $# -ge 2 ] || { usage; exit 2; }; PATCHES_DIR="$2"; shift 2 ;;
    *) usage; exit 2 ;;
  esac
done

case "$MODE" in
  check) run_check ;;
  self-test) run_self_test ;;
  "") run_write ;;
esac
