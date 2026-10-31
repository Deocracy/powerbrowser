---
phase: 49-release-pipeline-and-legion-runner-e
plan: 49-02 (Tasks 1-2)
reviewed: 2026-10-31
depth: deep
files_reviewed: 6
files_reviewed_list:
  - scripts/legion-pre-job-hook.sh
  - scripts/verify-hook-refusal.mjs
  - scripts/verify-platform.sh
  - inventory/brand-tokens.json
  - docs/RELEASING.md
  - .planning/workstreams/deploy/phases/49-release-pipeline-and-legion-runner-e/BLOCKED.md
findings:
  blocker: 0
  warning: 4
  info: 3
  total: 7
status: issues_found
---

# Plan 49-02 Tasks 1-2: Code Review

Range `69659b44..HEAD` in `/home/chris/gsd-workspaces/deploy/dsh/phase-49`.

Checks run: `bash -n` clean, `shellcheck` not installed, `verify-platform.sh --only hook-refusal` and
`--only hook-refusal-self-test` PASS, `node scripts/verify-hook-refusal.mjs --self-test` PASS (4 plants red),
`scan-brand-residue.mjs` PASS. Hook run under `env -i` with planted values (results in the findings).

Confirmed sound:

- Exact string compares on all three variables. A trailing space, a lower-case owner,
  `other.yml@refs/heads/main`, `GITHUB_EVENT_NAME=workflow_call` and an empty event all exit 1.
- Missing or empty variables exit 1 (`${VAR:-}` with `set -u`).
- No eval, no unquoted expansion, no network, no write.
- The verifier feeds the shipped file text to `bash -s`, so it executes the real hook, not a copy.
- Each of the four self-test plants deletes exactly one anchored line and goes red naming the file, variable and value.
- Brand count 30 -> 35 is justified: the hook holds the slug 4 times (lines 17 and 18, once in the test and once in the
  message each) and the registration-token command in RELEASING.md adds 1. The file is listed by name in both lists and the
  scan is green. The slug is not derived in the hook because the hook is deployed standalone; the verifier derives the
  expectation from `configuration.toml` and compares behaviourally, which is the right shape.

No BLOCKER is proven. The hook has never run under a real runner, so the first two WARNINGS are conditional: they
become BLOCKERs if the owner's live drill shows job-controlled environment reaches the hook.

## Warnings

### WR-01: Hook is defeatable by a hostile environment (exported bash functions, BASH_ENV)

**File:** `scripts/legion-pre-job-hook.sh:17-19`
**Failure scenario:** The tests use the `[` builtin and `exit`. Bash imports exported functions from the environment at
start-up, and a function named `[` shadows the builtin. Reproduced:

```
env -i PATH="$PATH" 'BASH_FUNC_[%%=() { return 0; }' GITHUB_REPOSITORY=evil/x \
  GITHUB_WORKFLOW_REF=evil/x/.github/workflows/y.yml@refs/heads/z GITHUB_EVENT_NAME=push \
  bash --noprofile --norc -e -o pipefail scripts/legion-pre-job-hook.sh      # exit 0
```

`BASH_ENV=<file>` is likewise sourced before line 1 runs (reproduced: `SOURCED_BASH_ENV` printed). If any
job- or workflow-level `env:` value (or anything else a non-main job controls) reaches the hook process, the refusal
is skipped. Whether it does is unverified (WR-02), and `verify-hook-refusal.mjs:89` passes only PATH plus the triple, so the
row cannot see this class.
**Fix:** Use keywords and `builtin` so no imported function can shadow them. Verified to refuse with
`[`, `exit` and `echo` all shadowed:

```bash
[[ "$repo" == 'Deocracy/powerbrowser' ]] || { builtin echo "..." >&2; builtin exit 1; }
```

(the same for `$ref` and `$event`). Add a refusal-table row that sets `BASH_FUNC_[%%`, `BASH_FUNC_exit%%` and
`BASH_ENV` alongside a foreign triple and requires exit non-zero. `BASH_ENV` cannot be fixed inside the script, so the
unit should not pass job environment to the hook (WR-02 decides this).

### WR-02: Whether job-controlled environment or container setup precedes the hook is unverified, and the drill that would show it is optional

**File:** `.planning/workstreams/deploy/phases/49-release-pipeline-and-legion-runner-e/BLOCKED.md` (Task 3 step 10), `docs/RELEASING.md:333-346`
**Failure scenario:** The mandatory drill is `env -i ... hook.sh`, which tests the script, not the runner. It cannot show:

1. whether a job-level or workflow-level `env:` of `GITHUB_REPOSITORY`, `GITHUB_WORKFLOW_REF`, `GITHUB_EVENT_NAME`, `BASH_ENV`
   or `BASH_FUNC_*` overrides what the hook sees;
2. whether `GITHUB_WORKFLOW_REF` is set in the hook's environment at all (if absent the hook refuses the legitimate
   release, which is fail-closed but blocks it);
3. whether a job with `container:` or `services:` has started a container before the hook runs. `podman` is in
   `extraPackages` and `autoSubUidGidRange` is set, so a container job can run on the host.

The live drill is described as "optional, the owner's choice", although it is the only test of the control that
matters. RELEASING.md also claims "the hook's stderr appears in the job log" without measurement.
**Fix:** Make the live drill mandatory before criterion 1 is marked met. Push a throwaway branch with a
`powerbrowser-release` job that (a) sets job-level `env:` to the exact release triple, (b) sets `BASH_ENV`, and (c) a second job with
`container: { image: ... }`. Each must fail at set-up before any step and before any container pull. Record the result in
the SUMMARY. If (a) shows env reaches the hook, this and WR-01 become BLOCKERs and the hook needs a source of truth
other than env (for example read the runner's `GITHUB_EVENT_PATH` JSON).

### WR-03: Refusal table cannot go red for a weakened (as opposed to deleted) test

**File:** `scripts/verify-hook-refusal.mjs:95-105`, `scripts/verify-hook-refusal.mjs:245-250`
**Failure scenario:** The only negative rows are feature-branch ref, push event, wrong repo and empty triple, and every
self-test plant deletes a whole line. A weakening that keeps a test but loosens it stays green. Reproduced with
`[[ "$ref" == *@refs/heads/main ]]`: it refuses `.../release.yml@refs/heads/feature-branch` (exit 1, so the row is
satisfied) but accepts `.../.github/workflows/other.yml@refs/heads/main` (exit 0). That is exactly the "any workflow on
main" hole the hook exists to close, and the verifier cannot see it.
**Fix:** Add rows derived from the same expectation (no hand-kept list): same repo and branch with a different workflow
file (`ci.yml@refs/heads/main`); `release.yml@refs/heads/main-x`; `release.yml@refs/tags/main`; the correct ref with a
trailing space; `GITHUB_EVENT_NAME` of `workflow_call`, `pull_request`, `Workflow_Dispatch`; repo owner in a different case. Add
a plant that loosens (not deletes) the ref test to a suffix glob and requires red naming
`GITHUB_WORKFLOW_REF`. Add the hostile-environment rows from WR-01.

### WR-04: RELEASING.md and BLOCKED.md tell the owner to delete the token file, and the nix block contradicts the verified option names

**File:** `docs/RELEASING.md:309-322, 354-373, 653-657, 1090-1095`; `BLOCKED.md` Task 3 step 9 versus "Two corrections" 1 and 2
**Failure scenario:**

1. RELEASING.md ("Remove the file once the runner shows online"), the secrets table ("present only from minting until
   the runner is online") and BLOCKED step 9 (`pkexec rm -f /var/lib/secrets/github-runner-registration`) all instruct
   deleting the token file. The verified section's correction 2 says the opposite: while `tokenFile` points at the
   file, deleting it breaks the unit on a restart or reboot (the module reads the file as a service credential), and
   changing its content re-registers. An owner following step 9 produces a runner that does not come back after the
   next reboot or `systemctl restart`. The corrections were appended to BLOCKED.md only; steps 4 and 9 and
   RELEASING.md were left as they were.
2. The RELEASING.md nix block still uses `systemd.services.github-runner-powerbrowser-release.environment.ACTIONS_RUNNER_HOOK_JOB_STARTED`
   and omits `tokenType`. The verified section says use `services.github-runners.<name>.extraEnvironment` and set
   `tokenType = "registration"` explicitly. The prose still says "If the module has a token-type option", which the
   verified section has settled. RELEASING.md is the document the owner copies from.
3. BLOCKED step 4 still says the option names "were NOT verified in this run" while the section below says all exist.
**Fix:** Edit RELEASING.md and BLOCKED steps 4, 8 and 9 to match the verified section: `extraEnvironment`,
`tokenType = "registration"`, leave the expired token file in place, mint a new token only for a deliberate
re-registration. Reword the secrets-table row ("present from minting; expired and harmless afterwards") and the
troubleshooting paragraph at 1090. Reorder BLOCKED step 8 so it no longer depends on the file being deleted in step 9.

## Info

### IN-01: The "option names verified" list omits options the nix block uses

**File:** `BLOCKED.md` (last section), `docs/RELEASING.md:354-373`
**Issue:** Verified: `enable, url, name, user, workDir, extraLabels, noDefaultLabels, tokenFile, tokenType, ephemeral,
replace, runnerGroup, extraEnvironment, nodeRuntimes` and `users.users.<name>.autoSubUidGidRange`. The block also
uses `extraPackages`, `users.users.pb-runner.{isSystemUser,group}`, `users.groups.pb-runner`, and
`environment.etc.<name>.{source,mode}`. The module's behaviour with a static `user` plus a custom `workDir` (state
directory ownership, sandbox write paths) is also not recorded as checked. `nodeRuntimes` was verified but is unused.
`podman` is in `extraPackages` but no later step checks that rootless podman works for `pb-runner`.
**Fix:** Verify these against the nixos MCP and the pinned `github-runner/options.nix` and add them to the list.
`pkexec nixos-rebuild dry-build` (step 5) will catch a wrong name but not a wrong sandbox path.

### IN-02: Hook does not constrain which main commit's workflow runs (re-runs)

**File:** `scripts/legion-pre-job-hook.sh:13-19`
**Issue:** A re-run of an older `workflow_dispatch` run on main keeps `GITHUB_WORKFLOW_REF=...@refs/heads/main` and
`GITHUB_EVENT_NAME=workflow_dispatch`, but executes the workflow file from the original run's `GITHUB_SHA`. If main ever
carried a workflow version that is no longer acceptable (since reverted), a re-run of that run is admitted. The repo
controls limit who can reach main, so this is residual, not a bypass.
**Fix:** Optional. Reject `GITHUB_RUN_ATTEMPT` other than 1 (build-linux already tells the owner to start a fresh
dispatch after a late failure), at the cost of making re-runs impossible.

### IN-03: Deployed hook drift is a manual hash comparison, not a check

**File:** `docs/RELEASING.md:342-346`, `BLOCKED.md` step 3
**Issue:** The control that runs is `/etc/pb-runner/legion-pre-job-hook.sh`, a copy of a copy
(`/etc/nixos/pb-runner/...`). `hook-refusal` tests only the tracked file. After any later edit of the tracked hook (for
example a slug change) the deployed copy stays stale until someone repeats the `sha256sum` comparison, and a stale hook
fails closed on a changed slug or stays too narrow if the hook is ever widened.
**Fix:** Add the expected `sha256` of the tracked hook to the release checklist/runbook output, or a read-only
`--deployed` mode on the verifier that hashes `/etc/pb-runner/legion-pre-job-hook.sh` when present.

---

_Reviewed: 2026-10-31_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: deep_
