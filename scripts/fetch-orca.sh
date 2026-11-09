#!/usr/bin/env bash
# Phase 60 (RUN-01, P59-02): the one documented command that materializes the
# Orca source checkout orca/ at the pinned tag AND its pinned commit. Safely
# re-runnable -- an existing orca/ is verified against the pin, never re-cloned.
#
# The pin is declared once in configuration.toml ([upstreams] orca_tag and
# orca_commit) and emitted into generated/upstream-pins.env by
# `node scripts/generate.mjs` as UPSTREAM_ORCA_TAG and UPSTREAM_ORCA_COMMIT.
# An explicit TAG= export overrides it (the re-pin job), and must come with its
# own COMMIT= export: resolve it with
#   git ls-remote https://github.com/stablyai/orca.git "refs/tags/$TAG^{}"
# (the ^{} line -- the tag is annotated, so the bare ref names the tag object,
# not the commit). There is deliberately no literal fallback.
#
# A tag can be force-moved upstream; the commit cannot. The clone lands in
# orca.partial, its HEAD is compared with the pinned commit, and only a match
# is renamed to orca/. A mismatch never becomes orca/.
#
# Usage: scripts/fetch-orca.sh            fetch or verify orca/
#        scripts/fetch-orca.sh --self-test exercise the logic on a local fixture
set -euo pipefail

REMOTE="https://github.com/stablyai/orca.git"

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ORCA_DIR="$REPO_ROOT/orca"
PINS_FRAGMENT="$REPO_ROOT/generated/upstream-pins.env"
SELF="$REPO_ROOT/scripts/fetch-orca.sh"

# Clone <remote> at <tag> into <target>.partial, require HEAD == <commit>, then
# rename to <target>. A leftover <target>.partial is removed first.
clone_verify_rename() {
  local remote="$1" tag="$2" commit="$3" target="$4"
  local partial="$target.partial" head
  rm -rf "$partial"
  if ! git -c advice.detachedHead=false clone -q --depth 1 --branch "$tag" "$remote" "$partial"; then
    rm -rf "$partial"
    echo "fetch-orca: FAIL -- could not clone $tag from $remote." >&2
    return 1
  fi
  head="$(git -C "$partial" rev-parse HEAD 2>/dev/null || true)"
  if [ "$head" != "$commit" ]; then
    rm -rf "$partial"
    echo "fetch-orca: FAIL -- $tag resolves to ${head:-<unresolvable>}, the pin names $commit." >&2
    echo "  Nothing was written to $target. If the tag moved upstream, re-pin deliberately:" >&2
    echo "  set orca_commit in configuration.toml to the peeled commit, then run: node scripts/generate.mjs" >&2
    return 1
  fi
  mv "$partial" "$target"
}

# Verify an existing <target> is a git checkout whose HEAD and <tag>^{commit}
# both equal <commit>.
verify_existing() {
  local tag="$1" commit="$2" target="$3"
  local top real head tag_sha
  real="$(cd "$target" && pwd -P)"
  # --show-toplevel, not --git-dir: a plain directory inside this repo would
  # otherwise resolve to the PowerBrowser checkout itself.
  top="$(git -C "$target" rev-parse --show-toplevel 2>/dev/null || true)"
  if [ "$top" != "$real" ]; then
    echo "fetch-orca: FAIL -- $target exists but is not a git checkout." >&2
    echo "  Most likely an interrupted clone. Remove it and re-run:" >&2
    echo "    rm -rf '$target' && '$SELF'" >&2
    return 1
  fi
  head="$(git -C "$target" rev-parse HEAD 2>/dev/null || true)"
  tag_sha="$(git -C "$target" rev-parse "refs/tags/$tag^{commit}" 2>/dev/null || true)"
  if [ "$head" != "$commit" ] || [ "$tag_sha" != "$commit" ]; then
    echo "fetch-orca: FAIL -- $target HEAD (${head:-<unresolvable>}) or $tag (${tag_sha:-<tag not present>}) is not the pinned commit $commit." >&2
    echo "  Remove it and re-run to re-materialize at the pin:" >&2
    echo "    rm -rf '$target' && '$SELF'" >&2
    return 1
  fi
}

# ---------------------------------------------------------------------------
# --self-test: a throwaway fixture repo with two commits and two annotated
# tags, served as a local file:// remote. Never touches the real orca/ and
# never reads a remote from the environment.
# ---------------------------------------------------------------------------
run_self_test() {
  local tmp
  tmp="$(mktemp -d)"
  trap 'find "$tmp" -delete' RETURN

  local g=(git -c user.email=test@example.invalid -c user.name=Test -c commit.gpgsign=false -c tag.gpgsign=false)
  local repo="$tmp/repo" remote c1 c2 tagobj1
  mkdir -p "$repo"
  git -C "$repo" init -q
  echo one > "$repo/f"
  "${g[@]}" -C "$repo" add f
  "${g[@]}" -C "$repo" commit -q -m one
  "${g[@]}" -C "$repo" tag -a v1.0.0 -m v1.0.0
  echo two > "$repo/f"
  "${g[@]}" -C "$repo" commit -q -am two
  "${g[@]}" -C "$repo" tag -a v2.0.0 -m v2.0.0
  c1="$(git -C "$repo" rev-parse 'refs/tags/v1.0.0^{commit}')"
  c2="$(git -C "$repo" rev-parse 'refs/tags/v2.0.0^{commit}')"
  tagobj1="$(git -C "$repo" rev-parse refs/tags/v1.0.0)"
  remote="file://$repo"

  local failures=0
  pass() { echo "self-test: $1 PASS ($2)"; }
  fail() { echo "self-test: $1 FAIL ($2)" >&2; failures=1; }

  # 1. wrong commit: refused before the rename; no target, no partial left.
  local t="$tmp/t-wrong"
  if clone_verify_rename "$remote" v1.0.0 "$c2" "$t" 2>"$tmp/err"; then
    fail wrong-commit "accepted a tag that resolves to another commit"
  elif [ -e "$t" ] || [ -e "$t.partial" ]; then
    fail wrong-commit "refused, but left $t or $t.partial behind"
  elif grep -q "$c1" "$tmp/err" && grep -q "$c2" "$tmp/err"; then
    pass wrong-commit "refused naming both SHAs, no target created"
  else
    fail wrong-commit "refused, but the message does not name both SHAs"
  fi

  # 2. the annotated tag object's SHA as the pin is refused.
  t="$tmp/t-tagobj"
  if clone_verify_rename "$remote" v1.0.0 "$tagobj1" "$t" 2>"$tmp/err"; then
    fail tag-object-sha "accepted the tag object SHA as the commit"
  elif [ -e "$t" ]; then
    fail tag-object-sha "refused, but created $t"
  else
    pass tag-object-sha "refused the tag object, the pin must be the peeled commit"
  fi

  # 3. an existing target at the other tag is refused with the remediation.
  t="$tmp/t-other"
  if ! clone_verify_rename "$remote" v2.0.0 "$c2" "$t" 2>"$tmp/err"; then
    fail existing-other-tag "fixture clone at v2.0.0 failed: $(cat "$tmp/err")"
  elif verify_existing v1.0.0 "$c1" "$t" 2>"$tmp/err"; then
    fail existing-other-tag "accepted a checkout at another tag"
  elif grep -q 'rm -rf' "$tmp/err"; then
    pass existing-other-tag "refused with the rm -rf remediation"
  else
    fail existing-other-tag "refused, but no rm -rf remediation"
  fi

  # 4. a non-git target is refused with the remediation.
  t="$tmp/t-plain"
  mkdir -p "$t"
  if verify_existing v1.0.0 "$c1" "$t" 2>"$tmp/err"; then
    fail non-git-target "accepted a plain directory"
  elif grep -q 'not a git checkout' "$tmp/err" && grep -q 'rm -rf' "$tmp/err"; then
    pass non-git-target "refused with the rm -rf remediation"
  else
    fail non-git-target "refused, but the message is wrong"
  fi

  # 5. a leftover partial directory is cleared before a good clone.
  t="$tmp/t-leftover"
  mkdir -p "$t.partial"
  echo junk > "$t.partial/junk"
  if ! clone_verify_rename "$remote" v1.0.0 "$c1" "$t" 2>"$tmp/err"; then
    fail leftover-partial "good clone failed: $(cat "$tmp/err")"
  elif [ -e "$t/junk" ] || [ -e "$t.partial" ]; then
    fail leftover-partial "leftover content survived"
  else
    pass leftover-partial "stale partial removed, clean clone renamed"
  fi

  # 6. TAG without COMMIT is refused naming COMMIT, before any clone.
  if env -u COMMIT TAG=v9.9.9 bash "$SELF" >/dev/null 2>"$tmp/err"; then
    fail tag-without-commit "a TAG export with no COMMIT ran"
  elif grep -q 'COMMIT' "$tmp/err"; then
    pass tag-without-commit "refused naming COMMIT"
  else
    fail tag-without-commit "refused, but the message does not name COMMIT"
  fi

  # 7. a correct fetch, then a re-run, both pass.
  t="$tmp/t-good"
  if ! clone_verify_rename "$remote" v1.0.0 "$c1" "$t" 2>"$tmp/err"; then
    fail fetch-then-rerun "correct fetch failed: $(cat "$tmp/err")"
  elif [ "$(git -C "$t" rev-parse HEAD)" != "$c1" ]; then
    fail fetch-then-rerun "target HEAD is not the pinned commit"
  elif ! verify_existing v1.0.0 "$c1" "$t" 2>"$tmp/err"; then
    fail fetch-then-rerun "re-run refused a correct checkout: $(cat "$tmp/err")"
  else
    pass fetch-then-rerun "fetched at the pin and re-verified without re-cloning"
  fi

  [ "$failures" -eq 0 ]
}

if [ "${1:-}" = "--self-test" ]; then
  run_self_test
  exit $?
fi
if [ $# -ne 0 ]; then
  echo "fetch-orca: FAIL -- unknown argument '$1'. Usage: scripts/fetch-orca.sh [--self-test]" >&2
  exit 2
fi

if [ -z "${TAG:-}" ]; then
  if [ -n "${COMMIT:-}" ]; then
    echo "fetch-orca: FAIL -- a COMMIT export needs its TAG export. Set both, or neither to use the pin." >&2
    exit 1
  fi
  if [ -f "$PINS_FRAGMENT" ]; then
    # shellcheck disable=SC1090 -- generated output, never checked in
    . "$PINS_FRAGMENT"
    TAG="${UPSTREAM_ORCA_TAG:-}"
    COMMIT="${UPSTREAM_ORCA_COMMIT:-}"
  fi
  if [ -z "${TAG:-}" ] || [ -z "${COMMIT:-}" ]; then
    echo "fetch-orca: FAIL -- no TAG export and $PINS_FRAGMENT carries no UPSTREAM_ORCA_TAG/UPSTREAM_ORCA_COMMIT." >&2
    echo "  Check [upstreams] orca_tag and orca_commit in configuration.toml, run 'node scripts/generate.mjs'" >&2
    echo "  from the repo root, then re-run this script." >&2
    exit 1
  fi
elif [ -z "${COMMIT:-}" ]; then
  echo "fetch-orca: FAIL -- TAG=$TAG is exported without COMMIT. Export the peeled commit too:" >&2
  echo "  COMMIT=\$(git ls-remote $REMOTE \"refs/tags/$TAG^{}\" | cut -f1)" >&2
  exit 1
fi

if ! git -C "$REPO_ROOT" check-ignore -q orca/ || ! git -C "$REPO_ROOT" check-ignore -q orca.partial/; then
  echo "fetch-orca: FAIL -- orca/ or orca.partial/ is not gitignored; refusing to clone into a tracked path." >&2
  echo "  Restore the anchored /orca/ and /orca.partial/ entries in .gitignore, then re-run." >&2
  exit 1
fi

if [ -e "$ORCA_DIR" ]; then
  verify_existing "$TAG" "$COMMIT" "$ORCA_DIR" || exit 1
  echo "fetch-orca: orca/ already at $TAG ($COMMIT), nothing to do"
  exit 0
fi

SECONDS=0
clone_verify_rename "$REMOTE" "$TAG" "$COMMIT" "$ORCA_DIR" || exit 1
echo "fetch-orca: cloned $TAG ($COMMIT) in ${SECONDS}s"
