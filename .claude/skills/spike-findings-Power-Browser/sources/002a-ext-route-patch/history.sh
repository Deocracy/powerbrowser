#!/usr/bin/env bash
# Spike 002a rebase-risk measurement (read-only, GitHub API via gh).
# 1. Fetches every file 050-extension-tab-host.patch touches at four ESR tags and
#    runs `git apply --check` of the patch against each (context-only apply, no 3-way).
# 2. Counts commits touching each file on the default branch between the
#    ESR 140.0 and ESR 153.0 release tags, and between 153.0 and 153.5.
# Usage: history.sh <out-dir>
set -euo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
OUT="${1:?out dir}"
REPO=mozilla-firefox/firefox
PATCH="$HERE/050-extension-tab-host.patch"
mapfile -t FILES < <(sed -n 's#^+++ b/##p' "$PATCH")
TAGS=(FIREFOX_115_0esr_RELEASE FIREFOX_128_0esr_RELEASE FIREFOX_140_0esr_RELEASE FIREFOX_153_0esr_RELEASE FIREFOX_153_5_0esr_BUILD1)
echo "== apply --check of the spike patch per tag"
for tag in "${TAGS[@]}"; do
  d="$OUT/$tag"; mkdir -p "$d"
  for f in "${FILES[@]}"; do
    mkdir -p "$d/$(dirname "$f")"
    gh api -H 'Accept: application/vnd.github.raw' "repos/$REPO/contents/$f?ref=$tag" > "$d/$f" 2>/dev/null || echo "MISSING" > "$d/$f"
  done
  if (cd "$d" && git apply --check "$PATCH" 2>"$d/apply.err"); then echo "$tag: applies cleanly"; else echo "$tag: FAILS -- $(grep -c 'patch failed' "$d/apply.err") hunk file(s): $(sed -n 's/^error: patch failed: //p' "$d/apply.err" | tr '\n' ' ')"; fi
done
date_of() { gh api "repos/$REPO/commits/$1" --jq .commit.committer.date; }
D140=$(date_of FIREFOX_140_0esr_RELEASE); D153=$(date_of FIREFOX_153_0esr_RELEASE); D1535=$(date_of FIREFOX_153_5_0esr_BUILD1)
echo "== commits per file (default branch) $D140 .. $D153, and on the pinned tag's history $D153 .. $D1535"
for f in "${FILES[@]}"; do
  n=$(gh api --paginate "repos/$REPO/commits?path=$f&since=$D140&until=$D153&per_page=100" --jq '.[].sha' | wc -l)
  m=$(gh api --paginate "repos/$REPO/commits?path=$f&sha=FIREFOX_153_5_0esr_BUILD1&since=$D153&until=$D1535&per_page=100" --jq '.[].sha' | wc -l)
  echo "$n main-commits 140->153 | $m commits on the 153 ESR line 153.0->153.5 | $f"
done
