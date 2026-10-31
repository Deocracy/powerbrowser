#!/usr/bin/env bash
# scripts/publish-bump-branch.sh <branch> <base-sha>
#
# Publishes HEAD to refs/heads/<branch> on origin for the release train (Phase 43, CR-01).
# It reads the remote branch through the GitHub API (GET requests only), asks the pure
# publishPlan in scripts/release-train.mjs what may happen, and pushes only when that plan
# allows it. A remote branch that carries a commit the bot App did not author is never
# overwritten, and a branch that already carries this tree is not pushed again.
#
# Needs in the environment: GH_TOKEN (the App installation token, used for the API reads and
# the push), GITHUB_REPOSITORY, and BOT_EMAIL (the author address the bot commits with).
# The caller has committed HEAD on the bump branch before calling this script.
#
# Prints one line on stdout: publish=<create|skip|force-with-lease|refuse>. A refusal is a
# hold, so it exits 0. A failed read or push exits non-zero.
set -euo pipefail

BRANCH="${1:?usage: publish-bump-branch.sh <branch> <base-sha>}"
BASE="${2:?usage: publish-bump-branch.sh <branch> <base-sha>}"
: "${GH_TOKEN:?GH_TOKEN is required}"
: "${GITHUB_REPOSITORY:?GITHUB_REPOSITORY is required}"
: "${BOT_EMAIL:?BOT_EMAIL is required}"

ERR=$(mktemp)
trap 'rm -f "$ERR"' EXIT

# The remote branch as the API reports it. A 404 means the branch is absent, which is a create.
TIP=""
TREE=""
CMP=""
if TIP=$(gh api "repos/${GITHUB_REPOSITORY}/branches/${BRANCH}" --jq '.commit.sha' 2>"$ERR"); then
  TREE=$(gh api "repos/${GITHUB_REPOSITORY}/git/commits/${TIP}" --jq '.tree.sha')
  # The commits on the remote branch that the base does not have, with their author addresses.
  # release-train.mjs refuses when the listing is shorter than the total.
  CMP=$(gh api "repos/${GITHUB_REPOSITORY}/compare/${BASE}...${TIP}" --jq '{total: .total_commits, emails: [.commits[].commit.author.email]}')
else
  if ! grep -q 'HTTP 404' "$ERR"; then
    cat "$ERR" >&2
    exit 1
  fi
  TIP=""
fi

LOCAL_TREE=$(git rev-parse 'HEAD^{tree}')
# The plan is read from the script's own checkout, so the caller can run this with another repository as the working
# directory (the fix-pr job publishes target/ while the trusted scripts come from main) without running that tree's code.
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PLAN=$(node "$HERE/release-train.mjs" --publish-plan "$LOCAL_TREE" "$TIP" "$TREE" "$CMP" "$BOT_EMAIL")
ACTION=$(sed -n 's/^publish=//p' <<<"$PLAN")
EXPECT=$(sed -n 's/^expect=//p' <<<"$PLAN")

# The App token authenticates the push. It is passed as a header, never in a URL or argv of a logged command.
AUTH=$(printf 'x-access-token:%s' "$GH_TOKEN" | base64 -w0)
# The base64 form is a usable credential that GitHub does not mask on its own, so register it
# before anything could echo the -c extraheader argument (a trace, an error, a later set -x).
echo "::add-mask::$AUTH"

case "$ACTION" in
  create)
    git -c "http.https://github.com/.extraheader=AUTHORIZATION: basic ${AUTH}" push origin "HEAD:refs/heads/${BRANCH}"
    ;;
  force-with-lease)
    # Replaces the bot-only tip that was read, and fails if the branch moved since.
    git -c "http.https://github.com/.extraheader=AUTHORIZATION: basic ${AUTH}" push --force-with-lease="refs/heads/${BRANCH}:${EXPECT}" origin "HEAD:refs/heads/${BRANCH}"
    ;;
  skip | refuse)
    ;;
  *)
    echo "publish-bump-branch: FAIL -- unknown plan '${ACTION}'" >&2
    exit 1
    ;;
esac

echo "publish=${ACTION}"
