#!/usr/bin/env bash
# D-74/D-77: the one documented command that moves the fork onto a new ESR
# tag. Composes scripts/fetch-upstream.sh (re-materialize + D-76 classifier)
# and scripts/apply-patches.sh (replay + D-75 non-vacuous per-patch
# assertion), then gates on scripts/check-patch-surface.sh before reporting
# success. It never reimplements the replay or the fail-loud behaviour --
# those live in the two composed scripts (D-74: upstream/ is fully
# disposable, patches/ is the single source of truth).
#
# The real (non-dry-run) path removes and re-clones upstream/, so per this
# plan's shared-state rule it is exercised locally only via --dry-run; its
# first real run is the CI dispatch (plan 03-06).
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
UPSTREAM_DIR="$REPO_ROOT/upstream"
REMOTE="https://github.com/mozilla-firefox/firefox.git"

DRY_RUN=0
NEW_TAG=""

while [ $# -gt 0 ]; do
  case "$1" in
    --tag)
      NEW_TAG="${2:-}"
      shift 2 2>/dev/null || shift
      ;;
    --dry-run)
      DRY_RUN=1
      shift
      ;;
    *)
      echo "rebase-upstream: FAIL -- unrecognized argument: $1" >&2
      echo "  usage: rebase-upstream.sh --tag <NEW_TAG> [--dry-run]" >&2
      exit 1
      ;;
  esac
done

if [ -z "$NEW_TAG" ]; then
  echo "rebase-upstream: FAIL -- usage: rebase-upstream.sh --tag <NEW_TAG> [--dry-run]" >&2
  exit 1
fi

# Echoed to stdout up front, on every path (success or failure): the
# requested tag drives every command this script prints or runs from here
# on, and it must never be silently substituted for the manifest pin --
# see it named here even if step 1 below rejects it.
echo "rebase-upstream: target tag: $NEW_TAG"

# Step 1a (WR-07, plan 01-18): the tag must be a plain tag NAME before it is
# used as anything else. `$NEW_TAG` is interpolated into a `git ls-remote`
# refspec, where it is a GLOB, and it used to be interpolated into a `grep`
# pattern, where it was a BRE. `--tag '*'` satisfied both -- it listed every tag
# and matched `refs/tags/*` as a regex -- so validation passed and the run went
# on to `rm -rf "$UPSTREAM_DIR"` before failing inside `git clone --branch '*'`.
# There is no command injection here (every use is quoted and `--branch`
# consumes its value positionally); the defect is that the step meant to catch a
# typo before a 1.1 GB clone could be satisfied by a pattern instead of a name.
if ! [[ "$NEW_TAG" =~ ^[A-Za-z0-9._-]+$ ]]; then
  echo "rebase-upstream: FAIL -- tag '$NEW_TAG' is not a plain tag name ([A-Za-z0-9._-]+)" >&2
  echo "  A glob or a pattern can satisfy the existence check below without naming a real tag," >&2
  echo "  and the run would then remove '$UPSTREAM_DIR' before failing in git clone." >&2
  exit 1
fi

# Step 1: verify the requested tag exists on the remote. Cheaper than
# discovering a typo after a 1.1 GB clone -- run in both real and dry-run
# modes.
#
# WR-06 (plan 01-18): the ls-remote output is captured FIRST and matched
# second, rather than piped into `grep -q`. `grep -q` exits on its first match,
# and if `git ls-remote` has not finished writing by then it takes SIGPIPE and
# exits 141; `set -o pipefail` propagates that as the pipeline's status, `if !`
# inverts it, and the script reports a tag that exists as missing --
# non-deterministically, at the first gate of a 40-minute operation. `|| true`
# keeps the capture from tripping `set -e`: a genuinely absent tag is an empty
# capture, which the match below rejects with the message it deserves.
#
# `-F` (WR-07) matches the ref as a literal, not as a BRE, so a `.` in a tag
# name cannot match a near-miss neighbour and report a typo as valid.
TAG_REFS="$(git ls-remote --tags "$REMOTE" "refs/tags/$NEW_TAG" || true)"
if ! printf '%s' "$TAG_REFS" | grep -qF -- "refs/tags/$NEW_TAG"; then
  echo "rebase-upstream: FAIL -- tag $NEW_TAG does not exist on $REMOTE" >&2
  echo "  Check the exact tag name: git ls-remote --tags $REMOTE | grep $NEW_TAG" >&2
  exit 1
fi

if [ "$DRY_RUN" -eq 1 ]; then
  echo "rebase-upstream: --dry-run for tag $NEW_TAG"
  echo "  1. [done above] git ls-remote --tags $REMOTE refs/tags/$NEW_TAG -- confirmed present"
  echo "  2. rm -rf '$UPSTREAM_DIR' && TAG=$NEW_TAG '$REPO_ROOT/scripts/fetch-upstream.sh'"
  echo "  3. '$REPO_ROOT/scripts/apply-patches.sh'"
  echo "  4. '$REPO_ROOT/scripts/check-patch-surface.sh'"
  echo '  4a. "'"$REPO_ROOT"'/scripts/regenerate-patches.sh" --check  # AUTO-10: every tracked patch equals its regeneration from the replayed tree (files upstream moved: added and removed lines only); a failure is reported after 4b-5b run'
  # WR-08 (plan 01-18): expanded, like every neighbouring line. It used to print
  # the literal `--extra-root "$UPSTREAM_DIR"`, which pasted into a shell where
  # that variable is unset becomes `--extra-root ""` and the scanner exits 2.
  # This script's header says the real path is exercised locally ONLY via
  # --dry-run, so this printed text IS the artifact under local test.
  echo "  4b. node '$REPO_ROOT/scripts/scan-brand-residue.mjs' --extra-root '$UPSTREAM_DIR'  # D-18 permanent gate, no exception; --extra-root reaches the replayed tree, which is git-ignored and invisible to git ls-files"
  echo "  5. TAG=$NEW_TAG '$REPO_ROOT/scripts/fetch-upstream.sh'  # re-check: fully-applied state at $NEW_TAG, not the manifest pin"
  echo "  5b. readlink -f '$UPSTREAM_DIR/powerbrowser'  # must resolve to '$REPO_ROOT/powerbrowser' -- git-excluded, invisible to step 5's classifier otherwise"
  echo "  6. Operator follow-up (not run here): '$REPO_ROOT/scripts/toolchain-baseline.sh' under 'nix develop .#firefox', diffed against '$REPO_ROOT/toolchain-baseline.txt' (PITFALLS #2)"
  exit 0
fi

echo "rebase-upstream: removing $UPSTREAM_DIR and re-materializing at $NEW_TAG"
rm -rf "$UPSTREAM_DIR"
if ! TAG="$NEW_TAG" "$REPO_ROOT/scripts/fetch-upstream.sh"; then
  echo "rebase-upstream: FAIL -- fetch-upstream.sh could not materialize $NEW_TAG" >&2
  exit 1
fi

echo "rebase-upstream: replaying patch stack"
if ! "$REPO_ROOT/scripts/apply-patches.sh"; then
  echo "rebase-upstream: FAIL -- apply-patches.sh failed replaying patches/*.patch onto $NEW_TAG" >&2
  exit 1
fi

echo "rebase-upstream: checking patch surface"
if ! "$REPO_ROOT/scripts/check-patch-surface.sh"; then
  echo "rebase-upstream: FAIL -- check-patch-surface.sh rejected the replayed stack" >&2
  exit 1
fi

# AUTO-10: a hand-edited hunk replays as a silent no-op under --3way, so the
# replayed tree is re-diffed and every tracked patch compared with it. A file
# $NEW_TAG moved is compared on its added and removed lines only (CR-01), so a
# clean replay onto a new ESR passes with a regenerate NOTE. A failure is held
# until the end: the brand scan, the classifier and the overlay check below
# still report on the new tag.
echo "rebase-upstream: checking every patch equals its regeneration"
REGEN_FAILED=0
if ! "$REPO_ROOT/scripts/regenerate-patches.sh" --check; then
  echo "rebase-upstream: FAIL (reported again at the end) -- a tracked patch's added or removed lines differ from the replayed upstream/: a hunk was edited by hand, or the replay onto $NEW_TAG changed what a patch does. The checks below still run." >&2
  REGEN_FAILED=1
fi

# D-18: the residual-brand scan is a PERMANENT gate from Phase 1 onward, not a
# one-shot migration check. It runs here because a rebase is the one routine
# operation that pulls in content nobody in this repo wrote, and a patch that
# replays cleanly can still reintroduce a stale brand string. Static and
# no-build, so it costs nothing next to the replay it follows.
#
# (Deliberately not spelling the old brand token in this comment: it lives in
# the scanned scope, so naming the literal here would make this file fail the
# very gate it invokes. The scan caught exactly that when this block was first
# written -- the inventory is the place that spells the tokens out.)
#
# Run with NO exception. Plan 01-03 hand-wrote the surfaces the codemod was
# forbidden to touch, so --except-hand-write was dropped here the moment the
# bare scan went green -- an exception that outlives the plan it was cut for is
# how a gate quietly stops being one.
#
# --extra-root "$UPSTREAM_DIR" is the CR-B correction (plan 01-15). The scan's
# ordinary file set is `git ls-files`, and .gitignore excludes upstream/, so
# until this argument was passed the invocation right here -- the one whose
# entire stated purpose is re-checking the tree the replay just rewrote -- read
# only the same tracked files the pre-replay scan had already read, and none of
# the replayed tree at all. --extra-root walks that tree from the filesystem
# under the same inventory filters, and fails loudly if it is missing or empty
# rather than skipping.
echo "rebase-upstream: scanning for residual brand strings"
if ! node "$REPO_ROOT/scripts/scan-brand-residue.mjs" --extra-root "$UPSTREAM_DIR"; then
  echo "rebase-upstream: FAIL -- scan-brand-residue.mjs found residual brand strings after the replay, in this repo's tracked tree or under $UPSTREAM_DIR" >&2
  exit 1
fi

echo "rebase-upstream: re-checking fully-applied state at $NEW_TAG"
if ! TAG="$NEW_TAG" "$REPO_ROOT/scripts/fetch-upstream.sh"; then
  echo "rebase-upstream: FAIL -- post-replay classifier did not report a fully-applied state at $NEW_TAG" >&2
  exit 1
fi

echo "rebase-upstream: asserting branding overlay resolves"
RESOLVED="$(readlink -f "$UPSTREAM_DIR/powerbrowser" 2>/dev/null || true)"
if [ "$RESOLVED" != "$REPO_ROOT/powerbrowser" ]; then
  echo "rebase-upstream: FAIL -- upstream/powerbrowser does not resolve to $REPO_ROOT/powerbrowser (got: ${RESOLVED:-<broken symlink>})" >&2
  echo "  The overlay path is git-excluded, so this is invisible to git status and to the classifier above --" >&2
  echo "  without this assertion a missing symlink would exit 0 here and fail later, deep in moz.build traversal." >&2
  exit 1
fi

if [ "$REGEN_FAILED" -eq 1 ]; then
  echo "rebase-upstream: FAIL -- a tracked patch does not match its regeneration from upstream/ at $NEW_TAG (see the regenerate-patches output above); every other check passed" >&2
  echo "  Next step: inspect the replayed upstream/, then run scripts/regenerate-patches.sh and commit the regenerated patches." >&2
  exit 1
fi

echo "rebase-upstream: PASS -- upstream/ rebased onto $NEW_TAG, patch stack replayed and verified non-vacuous, branding overlay resolves"
echo "rebase-upstream: operator follow-up required -- run '$REPO_ROOT/scripts/toolchain-baseline.sh' under 'nix develop .#firefox' and diff its output against '$REPO_ROOT/toolchain-baseline.txt' (PITFALLS #2)"
