#!/usr/bin/env bash
# scripts/legion-pre-job-hook.sh
#
# The ACTIONS_RUNNER_HOOK_JOB_STARTED target on legion (Phase 49, SEC-10). The runner runs it
# before the first step of every job, and a non-zero exit fails the job before any step runs.
# A repo-scoped runner sits in no runner group, so this hook is the only control bound to the
# runner itself. The three literals below are the release triple. scripts/verify-hook-refusal.mjs
# derives the repo from configuration.toml and requires these literals to accept exactly that
# triple and refuse the others. It reads three environment variables and exits 0 or 1: no
# network, no credential, no write, no eval.
set -euo pipefail

repo="${GITHUB_REPOSITORY:-}"
ref="${GITHUB_WORKFLOW_REF:-}"
event="${GITHUB_EVENT_NAME:-}"

[ "$repo" = 'Deocracy/powerbrowser' ] || { echo "legion pre-job hook: refused, GITHUB_REPOSITORY must be 'Deocracy/powerbrowser'" >&2; exit 1; }
[ "$ref" = 'Deocracy/powerbrowser/.github/workflows/release.yml@refs/heads/main' ] || { echo "legion pre-job hook: refused, GITHUB_WORKFLOW_REF must be 'Deocracy/powerbrowser/.github/workflows/release.yml@refs/heads/main'" >&2; exit 1; }
[ "$event" = 'workflow_dispatch' ] || { echo "legion pre-job hook: refused, GITHUB_EVENT_NAME must be 'workflow_dispatch'" >&2; exit 1; }

exit 0
