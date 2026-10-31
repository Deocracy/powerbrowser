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

# --upstream <dir> and --patches <dir> replay the stack onto a scratch tree (the replay-only control,
# plan 58-02, mirroring regenerate-patches.sh). The defaults are upstream/ and patches/, so
# rebase-upstream.sh and --self-test are unchanged. --self-test is left for the mode check below.
while [ "$#" -gt 0 ]; do
  case "$1" in
    --upstream) UPSTREAM_DIR="${2:?apply-patches: --upstream needs a directory}"; shift 2 ;;
    --patches) PATCHES_DIR="${2:?apply-patches: --patches needs a directory}"; shift 2 ;;
    --self-test) break ;;
    *) echo "apply-patches: FAIL -- unrecognized argument: $1 (usage: apply-patches.sh [--upstream <dir>] [--patches <dir>] | --self-test)" >&2; exit 2 ;;
  esac
done

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

if [ "${1:-}" = "--self-test" ]; then
  run_self_test
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
