#!/usr/bin/env bash
# D-74/D-75: replays patches/*.patch onto upstream/ in glob (zero-padded
# numeric prefix) order. Safely re-runnable: a second run over an
# already-applied stack fails by patch name rather than reporting success.
#
# git apply --3way was empirically measured (03-RESEARCH.md, D-75 experiment)
# to exit 0 with a completely silent no-op on already-adopted content -- the
# before/after blob-hash comparison below is the only mechanism that catches
# that silent drop. --3way (not plain `git apply`) is used because plain
# `git apply` fails on legitimate upstream drift a 3-way merge would resolve.
#
# --self-test (03-02 Task 3) proves the assertion actually goes red, without
# touching upstream/ or patches/ and without a 1.1 GB clone: reverse-applies
# the real 010-powerbrowser-identity.patch against a COPY of the real (already-
# patched) upstream file to derive a byte-identical pre-patch fixture --
# byte-identical is what matters here, because it makes the fixture's blob
# hash equal the patch's own "before" index hash, which is what lets the
# second `git apply --3way` below perform a genuine 3-way merge (silent
# no-op) instead of falling back to a plain non-3-way apply (a real conflict,
# which would prove nothing about D-75's actual failure mode).
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
UPSTREAM_DIR="$REPO_ROOT/upstream"
PATCHES_DIR="$REPO_ROOT/patches"

# A refusal names its cause and exits 2, before anything changes directory (WR-07).
refuse() { echo "apply-patches: FAIL -- $1. Next step: $2" >&2; exit 2; }
REPO_ROOT_P="$(cd -- "$REPO_ROOT" && pwd -P)"

# --upstream <dir> and --patches <dir> replay the stack onto a scratch tree (the replay-only control,
# plan 58-02, mirroring regenerate-patches.sh). The defaults are upstream/ and patches/, so
# rebase-upstream.sh and --self-test are unchanged. --self-test is left for the mode check below.
while [ "$#" -gt 0 ]; do
  case "$1" in
    --upstream|--patches)
      [ "$#" -ge 2 ] || refuse "$1 needs a directory" "give the directory path after $1"
      case "$2" in -*) refuse "$1 value '$2' starts with '-', so it is a flag, not a directory" "pass a directory path" ;; esac
      if [ "$1" = "--upstream" ]; then UPSTREAM_DIR="$2"; else PATCHES_DIR="$2"; fi
      shift 2 ;;
    --self-test) break ;;
    *) echo "apply-patches: FAIL -- unrecognized argument: $1 (usage: apply-patches.sh [--upstream <dir>] [--patches <dir>] | --self-test)" >&2; exit 2 ;;
  esac
done

# WR-07: resolve both directories to absolute paths and check them before the real run's cd. A relative
# --patches used to resolve against upstream/ after that cd, so the run failed with the wrong cause. The
# defaults pass the same checks. Each check names its cause.
UPSTREAM_ABS="$(cd -- "$UPSTREAM_DIR" 2>/dev/null && pwd -P)" || refuse "upstream directory '$UPSTREAM_DIR' is not a directory" "fetch it with scripts/fetch-upstream.sh, or pass --upstream <dir> for a scratch clone"
PATCHES_ABS="$(cd -- "$PATCHES_DIR" 2>/dev/null && pwd -P)" || refuse "patch directory '$PATCHES_DIR' is not a directory" "pass the directory that holds the patch stack, such as patches/"
if [ "$(git -C "$UPSTREAM_ABS" rev-parse --show-toplevel 2>/dev/null)" != "$UPSTREAM_ABS" ]; then
  refuse "upstream directory '$UPSTREAM_ABS' is not the top of its own git repository" "pass the top-level directory of a clone, not a folder inside one"
fi
if [ "$UPSTREAM_ABS" = "$REPO_ROOT_P" ]; then
  refuse "upstream directory is this checkout" "pass a scratch clone, never this repository"
fi
shopt -s nullglob
resolved_patches=("$PATCHES_ABS"/*.patch)
shopt -u nullglob
if [ "${#resolved_patches[@]}" -eq 0 ]; then
  refuse "patch directory '$PATCHES_ABS' contains no *.patch files" "pass the directory that holds the patch stack"
fi
UPSTREAM_DIR="$UPSTREAM_ABS"
PATCHES_DIR="$PATCHES_ABS"

# Applies a single patch file against the git repo rooted at the current
# working directory, asserting non-vacuity via before/after blob-hash
# comparison on every path the patch's own '+++ b/' headers name. Returns 0
# on a real, non-vacuous apply. Returns 1 and prints a FAIL message naming
# the patch on either a real conflict (git apply itself fails) or a silent
# no-op (git apply exits 0 but no touched file's hash changed) -- shared by
# the real run below and --self-test so the fixture exercises the exact
# logic the real tree is gated by.
apply_patch_with_assertion() {
  local p="$1"
  local name touched_files before_hashes after_hashes
  name="$(basename "$p")"

  touched_files="$(grep -E '^\+\+\+ b/' "$p" | sed 's#^+++ b/##')"
  if [ -z "$touched_files" ]; then
    echo "apply-patches: FAIL -- $name has no '+++ b/' target paths to verify against" >&2
    return 1
  fi

  before_hashes="$(for f in $touched_files; do git hash-object "$f" 2>/dev/null || echo "MISSING:$f"; done)"

  if ! git apply --3way "$p" 2>&1; then
    echo "apply-patches: FAIL -- $name did not apply (real conflict, not silent)" >&2
    return 1
  fi

  after_hashes="$(for f in $touched_files; do git hash-object "$f" 2>/dev/null || echo "MISSING:$f"; done)"

  if [ "$before_hashes" = "$after_hashes" ]; then
    echo "apply-patches: FAIL -- $name applied with exit 0 but changed nothing (D-75: silently already-adopted, or a genuine no-op patch)" >&2
    return 1
  fi

  return 0
}

# ---------------------------------------------------------------------------
# --self-test
# ---------------------------------------------------------------------------
run_self_test() {
  local tmp
  tmp="$(mktemp -d)"
  trap 'find "$tmp" -delete' RETURN

  local patch="$PATCHES_DIR/010-powerbrowser-identity.patch"
  if [ ! -f "$patch" ]; then
    echo "apply-patches: --self-test FAIL -- $patch does not exist" >&2
    return 1
  fi

  local target_rel="browser/moz.configure"
  if [ ! -f "$UPSTREAM_DIR/$target_rel" ]; then
    echo "apply-patches: --self-test FAIL -- $UPSTREAM_DIR/$target_rel does not exist (needed to derive the self-test fixture)" >&2
    return 1
  fi

  local repo="$tmp/repo"
  mkdir -p "$repo/browser"

  # Derive the exact pre-patch fixture from a COPY of the real, already-
  # patched upstream file -- never the real upstream/ tree itself, which is
  # never touched or cd'd into by this function.
  cp "$UPSTREAM_DIR/$target_rel" "$repo/$target_rel"
  if ! (cd "$repo" && git apply -R "$patch") 2>"$tmp/reverse.err"; then
    echo "apply-patches: --self-test FAIL -- could not derive the pre-patch fixture (reverse-apply of $(basename "$patch") failed)" >&2
    cat "$tmp/reverse.err" >&2
    return 1
  fi

  (
    cd "$repo"
    git init -q
    git config user.email "test@example.invalid"
    git config user.name "Test"
    git add "$target_rel"
    git commit -q -m "self-test: pre-patch fixture"
  )

  # First apply: must succeed and change the file.
  if ! (cd "$repo" && apply_patch_with_assertion "$patch") >/dev/null 2>"$tmp/first-apply.err"; then
    echo "apply-patches: --self-test FAIL -- first apply of $(basename "$patch") should have succeeded and changed the file" >&2
    cat "$tmp/first-apply.err" >&2
    return 1
  fi
  echo "apply-patches: --self-test PASS -- first apply of $(basename "$patch") succeeded and changed the file"

  # Second apply of the SAME patch onto the now-already-patched tree: D-75's
  # empirically-measured failure mode is `git apply --3way` exiting 0 with a
  # completely silent no-op -- the before/after blob-hash comparison inside
  # apply_patch_with_assertion is what must catch it and reject by name.
  # This is exactly the control the validation strategy calls out as
  # verified-necessary: without it, a patch upstream has silently adopted
  # would be dropped in silence and the resulting browser would ship with
  # the identity and telemetry change reverted to Mozilla defaults.
  if (cd "$repo" && apply_patch_with_assertion "$patch") >/dev/null 2>"$tmp/second-apply.err"; then
    echo "apply-patches: --self-test FAIL -- second apply of the same patch was NOT rejected" >&2
    cat "$tmp/second-apply.err" >&2
    return 1
  fi

  if grep -q "$(basename "$patch")" "$tmp/second-apply.err"; then
    echo "apply-patches: --self-test PASS -- second apply of $(basename "$patch") was correctly rejected by name"
  else
    echo "apply-patches: --self-test FAIL -- second apply was rejected, but the message doesn't name the patch" >&2
    cat "$tmp/second-apply.err" >&2
    return 1
  fi

  # Third drift class (05-04): real conflict. A target file whose context no
  # longer matches the patch must make `git apply --3way` itself fail, and
  # apply_patch_with_assertion must reject by patch name through its first
  # branch -- this is the drift class a silently-adopted patch is NOT:
  # upstream moved the surrounding lines so the hunk no longer locates.
  # Hermetic: a throwaway repo holding unrelated content at the same path,
  # never the real upstream/ tree (which this function never touches).
  local conflict_repo="$tmp/conflict-repo"
  mkdir -p "$conflict_repo/browser"
  printf 'unrelated\ncontent\nthat\nmatches\nneither\nimage\n' > "$conflict_repo/$target_rel"
  (
    cd "$conflict_repo"
    git init -q
    git config user.email "test@example.invalid"
    git config user.name "Test"
    git add "$target_rel"
    git commit -q -m "self-test: conflict fixture"
  )

  if (cd "$conflict_repo" && apply_patch_with_assertion "$patch") >/dev/null 2>"$tmp/conflict-apply.err"; then
    echo "apply-patches: --self-test FAIL -- apply onto conflict-drifted content was NOT rejected" >&2
    cat "$tmp/conflict-apply.err" >&2
    return 1
  fi

  if grep -q "$(basename "$patch")" "$tmp/conflict-apply.err"; then
    echo "apply-patches: --self-test PASS -- conflict-drifted apply of $(basename "$patch") was correctly rejected by name"
    return 0
  fi

  echo "apply-patches: --self-test FAIL -- conflict-drifted apply was rejected, but the message doesn't name the patch" >&2
  cat "$tmp/conflict-apply.err" >&2
  return 1
}

# ---------------------------------------------------------------------------
# --self-test argument plants (WR-07)
# ---------------------------------------------------------------------------
# Each bad --upstream or --patches value is refused with exit 2 and its named cause. The control proves
# a relative --patches resolves before the cd: the run reaches the patch and names it, instead of failing
# as an empty patch directory. Hermetic: throwaway repositories under a mktemp directory.
run_arg_plants() {
  local tmp self out rc plant_failed=0
  tmp="$(mktemp -d)"
  trap 'find "$tmp" -delete' RETURN
  self="$REPO_ROOT/scripts/apply-patches.sh"
  mkdir -p "$tmp/up/sub" "$tmp/empty" "$tmp/pp" "$tmp/work/pp"
  git -C "$tmp/up" init -q

  refusal_plant() {
    local name="$1" expect="$2"
    shift 2
    out="$(bash "$self" "$@" 2>&1)" && rc=0 || rc=$?
    case "$out" in
      *"$expect"*)
        if [ "$rc" -eq 2 ]; then
          echo "  ok  $name -> refused with exit 2, naming '$expect'"
          return 0
        fi ;;
    esac
    echo "apply-patches: --self-test FAIL -- '$name' was not refused with exit 2 naming '$expect' (exit $rc): $out" >&2
    plant_failed=1
  }

  refusal_plant "a missing --upstream directory" "is not a directory" --upstream "$tmp/no-such" --patches "$tmp/pp"
  refusal_plant "a flag-shaped --upstream value" "starts with '-'" --upstream --patches "$tmp/pp"
  refusal_plant "an --upstream inside a repository, not its top" "is not the top of its own git repository" --upstream "$tmp/up/sub" --patches "$tmp/pp"
  refusal_plant "a --patches directory with no *.patch files" "contains no *.patch files" --upstream "$tmp/up" --patches "$tmp/empty"
  refusal_plant "--upstream naming this checkout" "is this checkout" --upstream "$REPO_ROOT" --patches "$tmp/pp"
  refusal_plant "--patches given no value" "--patches needs a directory" --upstream "$tmp/up" --patches

  # Control: a relative --patches is resolved before the cd, so the run reaches the patch and names it.
  printf 'diff --git a/x.txt b/x.txt\n--- a/x.txt\n+++ b/x.txt\n@@ -1 +1 @@\n-a\n+b\n' > "$tmp/work/pp/001-scratch.patch"
  out="$(cd "$tmp/work" && bash "$self" --upstream "$tmp/up" --patches pp 2>&1)" && rc=0 || rc=$?
  case "$out" in
    *"001-scratch.patch did not apply"*)
      if [ "$rc" -eq 1 ]; then
        echo "  ok  control: a relative --patches resolves before the cd, so the patch is reached and named"
      else
        echo "apply-patches: --self-test FAIL -- the relative --patches control exited $rc, not 1" >&2
        plant_failed=1
      fi ;;
    *)
      echo "apply-patches: --self-test FAIL -- the relative --patches control did not reach and name its patch: $out" >&2
      plant_failed=1 ;;
  esac

  if [ "$plant_failed" -ne 0 ]; then return 1; fi
  echo "apply-patches: --self-test PASS -- every bad --upstream or --patches value was refused with exit 2 and its cause, and the relative --patches control reached its patch"
  return 0
}

if [ "${1:-}" = "--self-test" ]; then
  run_self_test || exit 1
  run_arg_plants
  exit $?
fi

# ---------------------------------------------------------------------------
# Real run
# ---------------------------------------------------------------------------
cd "$UPSTREAM_DIR"

shopt -s nullglob
patch_files=("$PATCHES_DIR"/*.patch)
shopt -u nullglob

if [ "${#patch_files[@]}" -eq 0 ]; then
  echo "apply-patches: FAIL -- $PATCHES_DIR contains no *.patch files" >&2
  exit 1
fi

for p in "${patch_files[@]}"; do
  name="$(basename "$p")"
  touched_files="$(grep -E '^\+\+\+ b/' "$p" | sed 's#^+++ b/##')"

  if ! apply_patch_with_assertion "$p"; then
    echo "  Remediation: git -C '$UPSTREAM_DIR' checkout -- $touched_files" >&2
    echo "  or: rm -rf '$UPSTREAM_DIR' && '$REPO_ROOT/scripts/fetch-upstream.sh' && '$REPO_ROOT/scripts/apply-patches.sh'" >&2
    exit 1
  fi
done

echo "apply-patches: all ${#patch_files[@]} patches applied and verified non-vacuous"
