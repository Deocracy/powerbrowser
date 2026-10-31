#!/usr/bin/env bash
# scripts/fixer-prepare.sh (Phase 52, FIX-02 and FIX-03): the fix job's regen-only prep.
#
# Two modes, both run from the trusted root checkout (main), never from work/:
#   --tag=<gecko-tag>            prep, before Claude runs. Fetches upstream/ at the tag with the
#                                one fetch script, then reports the target's state: conflict
#                                markers and the baseline --check over the target's patches.
#                                The fixer never sees a result that this script did not compute.
#   --emit-diff --out=<file>     emit, after Claude runs. Writes work.diff: the target's tracked and
#                                new files against its checkout commit, upstream/ excluded.
#
# The only patch path is scripts/regenerate-patches.sh, called with explicit --upstream and
# --patches. This script never text-edits a hunk (CLAUDE.md: patches are regenerated, never
# text-edited). It reads no secret, no App token and no key material; the only network use is
# the fetch of the pinned tag, through scripts/fetch-upstream.sh.
#
# Usage:
#   scripts/fixer-prepare.sh --tag=<gecko-tag>
#   scripts/fixer-prepare.sh --emit-diff --out=<file>
set -euo pipefail

NAME="fixer-prepare"
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
WORK="$REPO_ROOT/work"
UPSTREAM="$REPO_ROOT/upstream"

fail() {
  echo "$NAME: FAIL -- $1" >&2
  echo "  Next step: $2" >&2
  exit 1
}

MODE=""
TAG=""
OUT=""
for arg in "$@"; do
  case "$arg" in
    --tag=*) MODE=prep; TAG="${arg#--tag=}" ;;
    --emit-diff) MODE=emit ;;
    --out=*) OUT="${arg#--out=}" ;;
    *) echo "$NAME: FAIL -- unknown argument '$arg'" >&2; echo "  Next step: run with --tag=<gecko-tag>, or --emit-diff --out=<file>." >&2; exit 2 ;;
  esac
done

[ -n "$MODE" ] || fail "no mode given" "pass --tag=<gecko-tag> before the fixer runs, or --emit-diff --out=<file> after it."

# The target must be a separate checkout, never the trusted root itself.
[ -d "$WORK/.git" ] || [ -f "$WORK/.git" ] || fail "work/ is not a git checkout" "the fix job checks the target branch out into work/ before this script runs."
WORK_TOP="$(git -C "$WORK" rev-parse --show-toplevel)"
[ "$WORK_TOP" = "$WORK" ] || fail "work/ resolves to $WORK_TOP, not itself" "check out the target into work/ and run this script from the root."

if [ "$MODE" = prep ]; then
  # Gecko tags are checked by shape, so a free-text value never reaches the fetch.
  TAG_RE='^[A-Za-z]+_[0-9]+_[0-9]+(_[0-9]+)?esr_(RELEASE|BUILD[0-9]+)$'
  [[ "$TAG" =~ $TAG_RE ]] || fail "--tag '$TAG' is not an ESR tag" "pass the Gecko ESR tag the target replays onto."

  # The one fetch: upstream/ at the tag. An explicit TAG export overrides the pin fragment.
  TAG="$TAG" bash "$REPO_ROOT/scripts/fetch-upstream.sh"

  # Conflict markers in the target are a fact for the model, not a failure of the prep.
  MARKERS=$(git -C "$WORK" grep -l -e '^<<<<<<< ' -- . ':(exclude)upstream' || true)
  if [ -n "$MARKERS" ]; then
    echo "$NAME: NOTE -- conflict markers in the target:"
    printf '%s\n' "$MARKERS"
  else
    echo "$NAME: NOTE -- no conflict markers in the target"
  fi

  # The baseline --check over the target's patches, computed here so the model reads a result
  # this script produced. A failure is a NOTE: the fix is what changes it.
  if [ -d "$WORK/patches" ]; then
    BASELINE=$(mktemp)
    trap 'rm -f "$BASELINE"' EXIT
    if bash "$REPO_ROOT/scripts/regenerate-patches.sh" --check --upstream "$UPSTREAM" --patches "$WORK/patches" > "$BASELINE" 2>&1; then
      echo "$NAME: NOTE -- baseline regenerate-patches --check over the target's patches passes"
    else
      echo "$NAME: NOTE -- baseline regenerate-patches --check over the target's patches is red; last lines:"
      tail -n 5 "$BASELINE"
    fi
  else
    echo "$NAME: NOTE -- the target carries no patches/ directory"
  fi
  echo "$NAME: prepared upstream/ at $TAG; regenerate patches only with: bash scripts/regenerate-patches.sh --upstream upstream --patches work/patches"
  exit 0
fi

# emit mode
[ -n "$OUT" ] || fail "--emit-diff needs --out=<file>" "pass the file the diff is written to."
case "$OUT" in
  /*) ;;
  *) fail "--out must be an absolute path, got '$OUT'" "pass an absolute path outside work/." ;;
esac
case "$OUT" in
  "$WORK"|"$WORK"/*) fail "--out is inside work/" "write the diff outside the target checkout." ;;
esac

# New files are included as intent-to-add so git diff lists their bodies. Ignored paths never appear.
NEW_FILES=$(git -C "$WORK" ls-files --others --exclude-standard -- . ':(exclude)upstream')
if [ -n "$NEW_FILES" ]; then
    printf '%s\n' "$NEW_FILES" | while IFS= read -r f; do git -C "$WORK" add --intent-to-add -- "$f"; done
fi
git -C "$WORK" diff --no-ext-diff --no-color HEAD -- . ':(exclude)upstream' > "$OUT"
echo "$NAME: wrote $(wc -l < "$OUT") diff line(s) to $OUT"
git -C "$WORK" diff --stat HEAD -- . ':(exclude)upstream' || true
