---
phase: 52-claude-fixer-f
plan: 04
subsystem: infra
tags: [release-train, fixer, fix-gate, fix-pr, claude-code-action, wif, dispatch, zizmor, dry-run]

requires:
  - phase: 52-claude-fixer-f
    plan: 03
    provides: fixer contract, fixer-spend and fixer-auth rules, fixer-prepare.sh (with the work/.git trust-boundary fix)
  - phase: 43-release-train
    provides: the merged release-train.yml and release-train.mjs this plan extends
provides:
  - fix, fix-gate and fix-pr jobs appended to release-train.yml, reached only by a reason=fix dispatch
  - the seven fixer dispatch inputs and the run-name the attempt counter reads
  - the fixer-prompt rule's dispatch form, with its fixture moved to the dispatch model
  - scripts/fix-open-pr.mjs, the templated PR opener, with a self-test that needs no network
  - a committed lockfile for the pinned Claude Code CLI (.github/fixer/claude-cli)
  - docs/RELEASING.md Fixer spend limits (FIX-05) and Fixer routing (TRAIN-06); docs/RENEWALS.md fixer rows
  - .planning/workstreams/deploy/phases/52-claude-fixer-f/BLOCKED.md with the owner items and one open gate defect
affects: [52-05 owner checkpoint, Phase 43 train skeleton, Phase 53 triage]

actuals:
  tokens: 16840
  tasks: 3
  commits: 4
plan_head_before: 4e4dfcc282fa185aa4247392589c9805bd368a98
plan_head_after: 38d79541

tech-stack:
  added:
    - "@anthropic-ai/claude-code 2.1.314 (lockfile only, installed by npm ci in the fix job)"
  patterns:
    - "Three fixer jobs split the credential: the model holds the federated id-token and no App token; the gate holds nothing; only fix-pr mints the App token"
    - "Every fixer write step carries the negated inputs.dry-run gate; the environment-entering jobs carry it at job level"
    - "The opener renders its body from structured fields only; no code path reads model prose"

key-files:
  created:
    - scripts/fix-open-pr.mjs
    - .github/fixer/claude-cli/package.json
    - .github/fixer/claude-cli/package-lock.json
    - .planning/workstreams/deploy/phases/52-claude-fixer-f/BLOCKED.md
  modified:
    - .github/workflows/release-train.yml
    - scripts/verify-workflows.mjs
    - docs/RELEASING.md
    - docs/RENEWALS.md

key-decisions:
  - "release-train.yml exists (Phase 43), so the fixer jobs are appended to it. Phase 43's jobs keep their names and gate off for reason fix; the plan's skeleton and its 'no release-train.yml yet' premise are dropped"
  - "The seven fixer inputs are optional strings with empty defaults. Required inputs would break the Phase 43 tick, owner and self dispatches"
  - "The fixer-prompt rule accepts the workflow_dispatch guard form (live) and the held workflow_run form. A workflow_run guard on a dispatch job is always false, so the live job could never start"
  - "The Claude CLI is installed by npm ci from a committed lockfile at exact version 2.1.314, not an ad-hoc npm install (zizmor adhoc-packages). The version is the CLI this repository already runs"
  - "actions-selected.json is unchanged. anthropics/claude-code-action is already admitted; actions/upload-artifact and actions/download-artifact are GitHub-owned and need no admission, as the 52-02 note said"
  - "Pins reuse the SHAs already in the reviewed tree: checkout v4.4.0, install-nix v31.11.1, create-github-app-token v2 (fee1f7d6), upload-artifact v7.0.2 and download-artifact v8.0.2 (release.yml). The plan's create-github-app-token v3.3.0 pin is not used; the bump jobs use v2 and the fixer matches them"
  - "fix-pr adds permission-issues write to the App token. The bot App holds Issues write (app-powerbrowser-bot.json), so the release label is created when missing"
  - "Branch name is claude-fix/<key>-<class>-<attempt>, not the plan's claude-fix/<key>-<n>. Two classes can share a key, so class is part of the name"
  - "The fixer's Bash grant is one exact regenerate command and one exact verify command. The plan's git wildcard grant was removed by the 52-03 trust-boundary fix"
  - "fix-open-pr.mjs publishes nothing itself. fix-pr applies the gated diff and publishes through publish-bump-branch.sh, which is the Phase 43 plan that refuses foreign commits"

patterns-established:
  - "Dispatch guard names: each refusal reason starts with its guard name, so a plant names the guard it trips"

requirements-completed: [FIX-03, FIX-04, FIX-06, TRAIN-06, FIX-09]

duration: one session
completed: 2026-10-31
status: complete-with-open-defect
---

# Phase 52 Plan 04: Fixer workflow jobs, PR opener, drill, routing docs

**The fixer is wired into the real release train as three gated jobs, the PR opener renders from structured fields only, and the drill refuses a deny-listed diff, but a docs-only control stops at gate stage 7 in the gate's worktree, so no fix can land yet.**

## Performance

- **Tasks:** 3, landed as 4 commits (the workflow and its rule in one; the opener, the docs and the owner items each in their own).
- **Files:** 4 created, 4 modified.
- **Realised diff:** 67,360 characters (about 16,840 tokens by the chars/4 rule).

## Accomplishments

- `.github/workflows/release-train.yml`: `run-name` (`fix <key> <class> attempt <n>` for a fixer run, `release train <reason>` otherwise); seven optional fixer dispatch inputs; `fix` accepted as a reason; a fixer input check in `derive` (latest Release read with `gh release list`, then `release-train.mjs --fixer-inputs`); every Phase 43 job gated to `reason != fix`.
- The three fixer jobs, appended at the end of the file:
  - `fix`: `environment: fixer`, `concurrency: claude-fixer`, `timeout-minutes: 90`, `id-token: write` only. It checks out `main` for the trusted rules and the target into `work/`, installs the Claude CLI from the lockfile and checks its banner, rechecks its inputs, frames the failing log as data, runs the regen-only prep, runs the action with `--max-turns 40`, a scoped `--allowedTools` and the `work/.git` and `.gitattributes` denies, emits the diff from the pristine copy, and uploads it.
  - `fix-gate`: no `environment`, no secret, no `id-token`, `contents: read` and `actions: read`. It downloads the diff, fetches upstream at the tag, runs `yarn install --ignore-scripts --frozen-lockfile` in `theia/`, and runs `verify-fix-gate.mjs --diff --tag --ref origin/<target>`. Its verdict is a step output.
  - `fix-pr`: `environment: bot`, `permissions: {}`, the only App-token minter. It applies the gated diff with `git apply --index`, publishes through `publish-bump-branch.sh`, and runs `fix-open-pr.mjs --open`. It runs only when `fix-gate` passed.
- `scripts/fix-open-pr.mjs`: `renderBody(summary)` is pure. The summary is built from the diff and the trusted inputs; `modelProse` is never read. The opener opens or edits the PR, labels it `claude-fix` and `release:<key>` (creating the label if missing), and assigns the owner. Its self-test uses a recording runner.
- `scripts/verify-workflows.mjs`: the `fixer-prompt` rule accepts the dispatch guard form and the held workflow_run form, and names the missing guard of the form the `if:` uses. The fixture moves to the dispatch model. Plants are re-anchored; the fixer-tools and fixer-auth rules from 52-03 are unchanged.
- `docs/RELEASING.md`: `### Fixer spend limits (FIX-05)` and `### Fixer routing (TRAIN-06)`. `docs/RENEWALS.md`: the fixer workspace, federation, fallback and CLI pin rows, pending the owner checkpoint.

## Verification

- Workflow parse: `js-yaml` loads the file with ten jobs (`derive detect detect-node bump bump-pr bump-pr-node report fix fix-gate fix-pr`).
- `node scripts/verify-workflows.mjs` on the real tree: `PASS -- 6 workflow(s), 33 uses: line(s) pinned and admitted, rules enforced: ... fixer-pin, fixer-debug, fixer-tools, fixer-prompt, fixer-spend, fixer-auth, dry-run-gate, bot-job-gate`.
- `node scripts/verify-workflows.mjs --self-test`: `PASS -- 121 planted faults went red naming the file and job, and 11 controls stayed green`. The good fixer triple control stays green.
- `scripts/verify-platform.sh --only zizmor`: PASS. The first run flagged `adhoc-packages` on the `npm install`; the fix was the committed lockfile and `npm ci`, not a suppression. No `zizmor:` comment is in the file.
- `node scripts/fix-open-pr.mjs --self-test`: `PASS -- the body, labels, assignee, branch and failure paths hold, with no model prose and no network`.
- `scripts/fixer-prepare.sh --self-test` (the 52-03 trust-boundary proof, rerun): PASS.
- Acceptance greps: `schedule:|ACTIONS_STEP_DEBUG|actions/cache|secrets.inherit` in `release-train.yml` = 0; the claude-code-action pin `db77d4d3…` appears; no `ANTHROPIC_API_KEY` reference; `actions-selected.json` unchanged.
- `scripts/verify-platform.sh --quick`: exit 0, `verify-platform: PASS -- all checks passed`, on the final tree.

### Drill (local, no push, no dispatch)

No staged branch was created. The drill ran `verify-fix-gate.mjs` on two diffs made from temporary edits. Each file was restored from HEAD with `git checkout --` before the next step, and no branch or commit was made.

- **Deny-list diff** (a one-line change to `CLAUDE.md`): `fix-gate: FAIL -- verdict: reject; 1 problem(s) with the fix diff.` with `[path] "CLAUDE.md" matches the deny entry 'CLAUDE.md' ... Next step: drop that change from the fix`. Exit 1, refused at stage 1.
- **Control diff** (a one-line change to `docs/CUSTOMIZE.md`): stages 1 to 6 passed, and the run stopped at stage 7 with `[diff-theia-core] ... yarn check --integrity reported a mismatch`. Exit 1. This is the open defect below, not a fault in the diff.
- **Rendered PR body** from the control diff, with no network: the failing check, `1 file(s), 2 insertion(s), 0 deletion(s)`, the path `docs/CUSTOMIZE.md`, `Attempt 1 of 2`, the gate log link, and the labels `["claude-fix","release:v153.5.1-1"]`.

## Open defect (blocks the live proof)

`diff-theia-core.sh --quick` passes on unmodified HEAD in the clone. In the gate's patched worktree, which holds a copy of `theia/node_modules`, `yarn check --integrity` reports a mismatch, so every diff is refused at stage 7. The gate fails closed, so no fix can land until this is fixed. It is recorded in `BLOCKED.md` item 5 with the evidence and a reproduction path. The copy has no absolute symlinks (58 relative), and a copy of only `package.json` and `yarn.lock` is not a valid reproduction because it lacks the workspace packages. The cause is not yet found.

## Deviations from Plan

**1. [Rule 3 - Blocking] release-train.yml already exists (Phase 43).** The plan's skeleton and its "does not exist yet" premise are out of date. The fixer jobs are appended, and Phase 43's jobs are gated off for reason fix rather than replaced.

**2. [Rule 3 - Blocking] The fixer-prompt guard is the dispatch form.** The workflow_run guards the rule required are always false for a workflow_dispatch job, so the job could never start. The rule now accepts the dispatch form, and the held workflow_run form still passes.

**3. [Rule 2 - Missing] Claude CLI install is a lockfile, not an ad-hoc npm install.** The plan named a binary path but no install. zizmor's `adhoc-packages` audit flags an unlocked `npm install`. The committed lockfile pins 2.1.314 with sha512 integrity; `npm ci` installs it, and the banner is checked before the action runs it.

**4. [Scope] The artifact actions are GitHub-owned.** `actions-selected.json` is unchanged, following the 52-02 note: `actions/upload-artifact` and `actions/download-artifact` need no admission.

**5. [Scope] Pins reused from the reviewed tree.** `create-github-app-token` stays at the v2 pin the bump jobs use, not the plan's v3.3.0.

**6. [Deviation] No staged red branch.** The plan's drill made a local branch. The drill here used temporary edits on the working tree and restored each file, so no branch exists to delete. The drill gave the deny verdict and the control verdict described above.

**7. [Deviation] Branch name carries the class.** `claude-fix/<key>-<class>-<attempt>` instead of `claude-fix/<key>-<n>`, because two classes can share a key.

**8. [Adaptation] Opener creates the release label.** The bot App holds Issues write, so the release label is created when missing. The plan's BLOCKED item for it is withdrawn.

**9. [Adaptation] The fixer's Bash grant is exact.** Following the 52-03 trust-boundary fix, the model gets only the exact regenerate command and the exact verify command, with no git wildcard.

## Issues Encountered

- A stray placeholder was written to `/home/chris/gsd-workspaces/deploy/dsh/phase-52-claude-fixer-f/52-04-SUMMARY.md`, outside the repository. It was removed with a single-file `rm -f`, and the summary was written to the phase directory.
- The `verify-upstream-pins` sweep caught a Gecko tag literal in the opener's fixture. The fixture builds the tag at run time.
- The renewals checker requires each owner action to open with an allowed verb. Three rows were rewritten to fit.
- The first `zizmor` run flagged `adhoc-packages` on the CLI install (see deviation 3).

## Threat Flags

| Flag | File | Description |
|------|------|-------------|
| threat_flag: transitive execution (52-01 open item) | scripts/verify-fix-gate.mjs | Stage 8 runs `verify-platform.sh --quick` on the model's diff. The fix-gate job holds no secret, no environment and no id-token, so a planted script can only weaken the verdict, which the owner's review still gates. Not closed in this plan. |
| threat_flag: work/ inside the fix job | .github/workflows/release-train.yml | The model edits `work/**` and the job holds the federated id-token. The trust boundary is `fixer-prepare.sh` (no git inside `work/` after the model) and the denies in `--disallowedTools`. Both are asserted; the live credential path is not yet exercised. |

---
*Phase: 52-claude-fixer-f*
*Completed: 2026-10-31 (open defect: gate stage 7 in the gate worktree)*
