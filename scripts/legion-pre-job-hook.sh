#!/usr/bin/env bash
# scripts/legion-pre-job-hook.sh
#
# The ACTIONS_RUNNER_HOOK_JOB_STARTED target on legion (Phase 49, SEC-10). The runner runs it
# before the first step of every job, and a non-zero exit fails the job before any step runs.
# A repo-scoped runner sits in no runner group, so this hook is the only control bound to the
# runner itself. The literals below are the release triple plus attempt 1. scripts/verify-hook-refusal.mjs
# derives the repo from configuration.toml and requires these literals to accept exactly that
# triple and refuse the others. It reads four environment variables and exits 0 or 1: no
# network, no credential, no write, no eval, no external command.
#
# Hostile inherited environment (WR-01). Bash imports exported functions from the environment
# before line 1 runs, so a function named `[` or `exit` would replace the tests below. Defence:
#  - POSIXLY_CORRECT=1 is a plain assignment (no command lookup) that turns on posix mode, where
#    the special builtins set, unset, trap, export and exit are found before any function. `builtin`
#    is a regular builtin, so it is unset first; every later printf goes through it.
#  - Only [[ ]] (a reserved word, which no function can shadow) is used for tests.
#  - Any exported function, and any BASH_ENV or ENV, is refused. A BASH_ENV file runs before line 1
#    and cannot be undone here: start the hook as `bash -p --noprofile --norc <hook>` (-p ignores
#    BASH_ENV, ENV and imported functions) if the runner allows an interpreter.
#  - rc starts at 1 and the EXIT trap exits with it, so any unexpected path ends non-zero.
#  - GITHUB_RUN_ATTEMPT must be 1: a re-run replays the workflow file of an older commit (IN-02),
#    so a release re-run is a fresh dispatch.
POSIXLY_CORRECT=1
unset -f builtin
set -euo pipefail
rc=1
trap 'exit "$rc"' EXIT

[[ -z "$(export -f)" ]] || { builtin printf '%s\n' "legion pre-job hook: refused, the environment carries an exported shell function" >&2; exit 1; }
[[ ! -v BASH_ENV && ! -v ENV ]] || { builtin printf '%s\n' "legion pre-job hook: refused, BASH_ENV and ENV must be unset" >&2; exit 1; }

repo="${GITHUB_REPOSITORY:-}"
ref="${GITHUB_WORKFLOW_REF:-}"
event="${GITHUB_EVENT_NAME:-}"
attempt="${GITHUB_RUN_ATTEMPT:-}"

[[ "$repo" == 'Deocracy/powerbrowser' ]] || { builtin printf '%s\n' "legion pre-job hook: refused, GITHUB_REPOSITORY must be 'Deocracy/powerbrowser'" >&2; exit 1; }
[[ "$ref" == 'Deocracy/powerbrowser/.github/workflows/release.yml@refs/heads/main' ]] || { builtin printf '%s\n' "legion pre-job hook: refused, GITHUB_WORKFLOW_REF must be 'Deocracy/powerbrowser/.github/workflows/release.yml@refs/heads/main'" >&2; exit 1; }
[[ "$event" == 'workflow_dispatch' ]] || { builtin printf '%s\n' "legion pre-job hook: refused, GITHUB_EVENT_NAME must be 'workflow_dispatch'" >&2; exit 1; }
[[ "$attempt" == '1' ]] || { builtin printf '%s\n' "legion pre-job hook: refused, GITHUB_RUN_ATTEMPT must be '1'; start a fresh dispatch instead of re-running" >&2; exit 1; }

rc=0
exit 0
