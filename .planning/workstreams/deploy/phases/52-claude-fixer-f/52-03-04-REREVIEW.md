---
phase: 52-claude-fixer-f
plans: [52-03, 52-04]
reviewed: 2026-10-31T00:00:00Z
depth: deep
branch: dsh/phase-52
head: 69817033
files_reviewed: 9
files_reviewed_list:
  - .github/workflows/release-train.yml
  - scripts/fixer-isolate.sh
  - scripts/fixer-prepare.sh
  - scripts/verify-fix-gate.mjs
  - scripts/fix-open-pr.mjs
  - scripts/publish-bump-branch.sh
  - scripts/release-train.mjs
  - scripts/verify-workflows.mjs
  - docs/RELEASING.md
findings:
  blocker: 0
  warning: 7
  info: 5
  total: 12
status: issues_found
---

# Phase 52 plans 52-03 and 52-04: second code review (after the review fixes)

Scratch (diffs, plants, a copy of the workflows rule, an npm install of the pinned CLI) is under
/tmp/claude-1000/rv52c/. No tracked file was changed (I appended a line to `docs/CUSTOMIZE.md` and `CLAUDE.md` for a
few seconds to build the two control diffs, then restored both byte-for-byte; `git status` shows only the
pre-existing untracked `config.json`).

## What was run

| Command | Result |
| --- | --- |
| `node scripts/verify-fix-gate.mjs --self-test` | PASS, 37 plants, 3 controls |
| `node scripts/verify-workflows.mjs --self-test` | PASS, 165 plants, 11 controls |
| `node scripts/release-train.mjs --self-test` | PASS, 18 states, 53 plants, 40 controls |
| `bash scripts/fixer-isolate.sh --self-test` | PASS (strategy userns) |
| `bash scripts/fixer-prepare.sh --self-test`, `node scripts/fix-open-pr.mjs --self-test` | PASS |
| Real gate, docs-only control, `nix develop .#theia --command bash scripts/fixer-isolate.sh -- node scripts/verify-fix-gate.mjs --diff=docs.diff --tag=FIREFOX_153_5_1esr_RELEASE --ref=<HEAD>` | `verdict: pass ... every stage green`, exit 0 |
| Same, `CLAUDE.md` deny plant | `verdict: reject`, `[path] "CLAUDE.md" matches the deny entry`, exit 1 |
| `npm ci --ignore-scripts` of the pinned CLI lockfile, then `claude --version`, then `install.cjs`, then `--version` | stub error, then `2.1.314 (Claude Code)` |
| Three plants against the real `release-train.yml` through a copy of the workflows rule | all three survive (WR-06) |
| Isolation probes: kill/stop PID 1, `/proc/1/mem`, a filesystem unix socket, kernel group list | see WR-02, WR-03 |

## What holds (checked, no finding)

- The bytes chain is closed. `fix` computes `sha256sum "$RUNNER_TEMP/work.diff"` in a step after emit and before upload (workflow
  lines 873-890), and `base-sha` from the pristine copy's `base-sha` in a step before the model runs. Both are job outputs of a
  job that has finished before `fix-gate` starts. `fix-gate` and `fix-pr` each recompute the digest of the artifact they download
  and compare it to `needs.fix.outputs.diff-sha256`; `fix-pr`'s `if:` additionally requires the gate's echoed digest and base to equal
  the fix job's. The artifact is named from validated inputs and downloaded without `run-id` or `github-token`. A re-run attempt
  that left a different artifact would fail the digest check (fail closed). The file the gate reads on its VM is not the file `fix-pr`
  publishes (`fix-pr` downloads its own copy), so a gate process rewriting its local copy changes nothing.
- The model cannot reach anything after the gate except through the diff bytes. Its only shell commands are
  `scripts/regenerate-patches.sh --upstream upstream --patches work/patches` and `scripts/verify-platform.sh --quick`, both main's
  scripts run from the main root; its edits are `Edit(work/**)`; `$RUNNER_TEMP`, `~`, `/proc`, `.git` are denied for Read.
  `base-sha` and `diff-sha256` are written by steps it cannot influence.
- `fix-pr` runs only main's scripts. `T()` disables hooks and fsmonitor, the checkout config is fresh (no hooks, no filter
  config from the tree), `git apply` refuses to write through a symlink, and the gate rejects symlink, submodule, executable and
  binary changes before. The App token exists in exactly one step.
- The isolated command cannot kill or stop its own parent: `node` is PID 1 of the new PID namespace, and `kill -9 1` / `kill -STOP 1`
  from a child returned 0 and did nothing (checked); `/proc/1/mem` was `Permission denied` (this host has yama ptrace_scope 1).
  The verdict is a shell variable in the unisolated outer step, written after the isolated process tree is gone.
- If neither namespace form is available, `fixer-isolate.sh` exits 1 and never runs the command (`strategy none` -> `fail`). If
  `unshare` with the extra flags fails after the probe succeeded, the `exec` fails and the step is red.
- WR-04 body rendering: every printed field is a code span with a fence longer than any backtick run in the data; paths capped at
  50; quoted (`"a/..."`) headers are rejected by the gate before the opener sees them (checked with a path containing `"`).
  I found no remaining markdown, mention or issue-reference channel. The `gateUrl` is built by the workflow.
- Derive guard: `github.run_attempt != 1` refuses a whole-run re-run; the title grammar cannot be crafted to lower the count
  (a run only reaches `fix` if its inputs passed `fixerInputsCheck`; a dry run has a different run-name).

## Warnings

### WR-01: "Re-run failed jobs" on a fixer run spends model budget with no count, and the docs say otherwise

**File:** `.github/workflows/release-train.yml:737` (the `fix` job `if:`), `.github/workflows/release-train.yml:174-178`, `docs/RELEASING.md:592-593`
**Issue:** The re-run refusal (`RUN_ATTEMPT != 1`) lives only in the `derive` job. GitHub's "Re-run failed jobs" re-runs the
failed job (`fix`) and its dependents and keeps the earlier `derive` result and outputs, but `github.run_attempt` becomes 2 for the whole
run. `derive` does not re-execute, so the guard never sees the 2; the `fix` job has no `run_attempt` term in its `if:` and no budget
check of its own. Each click on a failed `fix` job therefore buys another 90 minute, 40 turn model run that no later `fixAttempts`
count sees (the run title is unchanged and the run is already counted once). REVIEW-FIX CR-04 and RELEASING.md both state "A re-run
of a fixer run is refused", which is true only for "Re-run all jobs". No plant in the workflows rule covers it.
**Fix:** add `github.run_attempt == 1 &&` to the `if:` of `fix` (and, to keep the claim true, of `fix-gate`; `fix-pr` can stay
re-runnable because publish is idempotent and digest-bound). Add a `fixer-spend` plant that removes it. Correct the sentence in
RELEASING.md to say what is enforced where.

### WR-02: The isolation does not contain files the runner uid owns, so a hostile gate process can run code outside it in later steps and post-steps

**File:** `scripts/fixer-isolate.sh:24-26` (the `shortcut:`), `.github/workflows/release-train.yml:942-962`
**Issue:** The shortcut says the command "cannot set the verdict". That is true of the job result and the outputs, but the command runs
as the runner uid, and the runner's per-step file-command files (`_temp/_runner_file_commands/add_path_*`, `set_env_*`,
`save_state_*`, `set_output_*`) are owned by that uid. The env is scrubbed so the command does not receive their names, but the
directory is listable. A process that appends a directory to the `add_path_*` file (GITHUB_PATH) or a variable to `set_env_*`
(GITHUB_ENV, for example `LD_PRELOAD`, `BASH_ENV`) has that applied by the runner to every later step of the job, including the
post-steps of `actions/checkout` (always present in `fix-gate`), which run `git` found through PATH, outside the namespace,
with network and with that JavaScript action's environment (`ACTIONS_RUNTIME_TOKEN`, the job's read-only token as the checkout's
`token` input). The PID namespace kill does not help because the write happens while the step is running. I checked the
primitives here (a path-based file under the uid is reachable and writable from inside the isolation; see WR-03) but did not run it
on a hosted runner: the runner's file-command layout is from the runner's documented behavior, so treat the end-to-end chain as
unconfirmed. Impact is bounded: the job holds no secret, the repository's `no-cache` rule means nothing reads a poisoned Actions
cache, and an artifact replacement is caught by the digest. What it breaks is the stated invariant "no network, nothing outside
the step", and it gives a hostile diff a network position and a runtime token it was meant never to have.
**Fix:** inside the mount namespace the wrapper already creates (both strategies), before `setpriv`, make the runner's control
files unwritable: `mount --bind` and `mount -o remount,ro,bind` over `"$RUNNER_TEMP/../_runner_file_commands"` (derive from the
scrubbed variables `GITHUB_PATH`, `GITHUB_ENV`, `GITHUB_OUTPUT` before they are unset, take their `dirname`), or run the command
under a dedicated uid with a copy of the worktree. Add to the self-test a probe that writes to a planted `add_path_x` in a fake
file-commands directory and requires the write to fail.

### WR-03: The unprivileged-userns strategy keeps the supplementary groups, and path-based unix sockets cross the network namespace

**File:** `scripts/fixer-isolate.sh:54, 65`
**Issue:** Reproduced: with the `unshare -rn` form the process shows `Groups: 65534 65534 65534 0 ...` (the kernel keeps the
caller's real groups; they display as nogroup), and a process inside connected to a listening unix socket `/tmp/.../x.sock`
(mode 660) created outside and printed its reply (`REACHED-OUTSIDE`). A new network namespace isolates abstract and network
sockets, not filesystem sockets. On a hosted runner the `runner` user is in the `docker` group and `/var/run/docker.sock` is
`root:docker 660`, so wherever the userns form is permitted (ubuntu-22.04, self-hosted, any image without AppArmor's userns
restriction) the isolated gate can start a container with `--network host --privileged`, which is full network and root. The
`sudo` form uses `--clear-groups` and is not affected for the docker socket (same-uid sockets are still reachable in both forms).
`ubuntu-latest` is now 24.04, where the restriction normally pushes the run to the sudo form, so this is the wrong-way-round
unverified path: the form that was exercised here is the one with the hole.
**Fix:** in the userns form, bind `/dev/null` over `/var/run/docker.sock`, `/run/docker.sock` and `/run/containerd/containerd.sock`
inside the mount namespace before `setpriv` (the namespace is already created by `--mount-proc`), or `fail` when any of them
exists; add a self-test probe that connects to a planted group-readable socket.

### WR-04: The `sudo` strategy is the likely live path on ubuntu-latest, has never run, and probably loses PATH

**File:** `scripts/fixer-isolate.sh:68-70`
**Issue:** `sudo -n -E unshare ... setpriv ... -- node scripts/verify-fix-gate.mjs` runs the command with sudo's `secure_path`
if one is set. The installed sudoers manual (1.9.17) says: `secure_path` "will use this value in place of the user's PATH"; `-E` is not
an exemption. A stock Ubuntu `/etc/sudoers` sets it. The gate step runs inside `nix develop .#theia`, whose PATH holds the pinned
node, yarn and node-gyp; after sudo `node` and `yarn` resolve to the runner image's copies (or not at all, exit 127), so stage 7
(`yarn --version` and `diff-theia-core.sh`) and stage 8 run with other toolchain versions than the ones the trusted tree was built
with. The most likely outcomes are a red gate on every legitimate diff or a gate that checked something other than what CI checks;
both are fail-closed, so nothing unsafe ships, but BLOCKED item 6 is where this will show up and it is cheaper to fix now.
Also unverified for this form: the order in which `setpriv` applies `--reuid` and `--bounding-set=-all`, and that `ip` exists for the
loopback bring-up in the userns form (`|| true` hides its absence; the rows that bind 127.0.0.1 then fail).
**Fix:** pass the path explicitly: `sudo -n -E env "PATH=$PATH" unshare ...`. Make `LO_UP` `ip link set lo up || { echo "fixer-isolate: NOTE -- could not bring lo up" >&2; }`
so the missing tool is visible. Add the owner check from BLOCKED item 6 to read the first lines of the isolated environment
(`command -v node yarn`) in the gate log.

### WR-05: A pass from stages 5-8 can be forged by code those stages run; the wording and the comments say it cannot

**File:** `scripts/verify-fix-gate.mjs:549-555` (the trusted overlay), `.github/workflows/release-train.yml:942-962` (comment "a step the model's code cannot set"), `scripts/fixer-isolate.sh:24-26`
**Issue:** The job result is safe from the diff's code (PID 1 cannot be killed or stopped from inside, checked). The stage results are
not: each is the exit status of a child (`check-patch-surface.sh`, `scan-brand-residue.mjs`, `diff-theia-core.sh`, `verify-platform.sh --quick`
and the scripts it fans out to) that runs from the worktree overlay `scripts/`, `inventory/`, `.github/`, which is copied in by `cp -a`
and is writable by the same uid, as is the whole trusted checkout reachable through the worktree's `.git` file. The first stage that
executes any code the diff carries (`powerbrowser/` and `theia/` code that a `--quick` row imports and no row names, which the gate's
own header concedes) can rewrite the scripts that later rows run, or the registry file bash is still reading, so later rows exit 0
without checking. I did not build such a diff; no concrete executed path outside the registry-named (denied) files was shown, so this is
a design limit, not a reproduction. Consequence: a `pass` of the dynamic stages means "the rows ran and reported green", not "the diff passed
them"; `fix-pr` re-runs only stages 1-7 in memory. The PR is still human-reviewed and CI runs on it, so the loss is defense in depth,
but the comments, REVIEW-FIX CR-02 and RELEASING.md present the isolation as making the verdict trustworthy.
**Fix:** after the overlay copy, make the overlay read-only for the isolated command (the same mount-namespace bind-ro as WR-02 over
`wt/scripts`, `wt/inventory`, `wt/.github`), or `chmod -R a-w` them and run as a uid that does not own them. State in
RELEASING.md that the dynamic stages are advisory against a hostile diff and the static re-run in `fix-pr` is the binding part.

### WR-06: The workflows rule still passes three plants that publish bytes nobody verified

**File:** `scripts/verify-workflows.mjs:676` (the `fix-pr` static-step check), `.github/workflows/release-train.yml:1004-1013, 1032`
**Issue:** The rule proves the static step exists, mentions `sha256sum` and carries the right `DIFF_SHA256`. I applied each plant to a
copy of the real `release-train.yml` and ran the real rule (baseline control: `workflows: PASS`); all three stayed `workflows: PASS`:
1. `continue-on-error: true` on the step "Verify the diff digest and re-run the pure gate stages on it" (a mismatching digest or a reject no longer stops the job).
2. `node scripts/verify-fix-gate.mjs --static-only --diff="$DIFF" || true` (same effect through the shell).
3. The apply step reading another file: `T apply --index "$GITHUB_WORKSPACE/other.diff"` instead of `"$RUNNER_TEMP/fix-diff/work.diff"`, so the verified bytes and the applied bytes differ.
The same gap exists for the gate step (`continue-on-error` there is harmless only because `fix-pr` also needs `verdict == pass`) and for
the `fix` job outputs, whose rule accepts any `steps.<id>.outputs.<name>` (rebinding `diff-sha256` to a step that ran before emit passes).
**Fix:** in the `fixer-gate` rule, for the two `fix-pr` steps that verify and apply: require no `continue-on-error`, no `|| true` / `|| :`
in the `run:` text, and that the path passed to `verify-fix-gate.mjs --diff=`, to `T apply --index`, and to `fix-open-pr.mjs --diff=` is the
one the sha256 step hashed (`$RUNNER_TEMP/fix-diff/work.diff`). Require `fix`'s `diff-sha256` to come from the step whose `run:` contains
`sha256sum` and which follows the emit step. One plant each.

### WR-07: The fix and fix-gate jobs copy a 5.6 GB upstream tree on a runner with no space-freeing step

**File:** `.github/workflows/release-train.yml:831-833` (fix prep), `:930-940` (fix-gate prepare), `scripts/verify-fix-gate.mjs:520-545` (`cp -a --reflink=auto`)
**Issue:** `du -sh upstream` in this clone is 5.6 GB (1.1 GB of it `.git`) and `theia/node_modules` 689 MB. The gate's worktree gets a
full copy of both on ext4 (`--reflink=auto` falls back to a real copy), on top of the fetched upstream, the Nix store for
`.#theia`, `yarn build` output, and the prepared tree: well over 12 GB before the quick rows write anything. `rebase-upstream.yml:66-68`
frees dotnet, android, ghc and hostedtoolcache before the same fetch because disk is the known limit; neither fixer job does. A full disk fails
closed (no `pass`), so it is a reliability defect that BLOCKED item 6 would discover only on the first live dispatch.
**Fix:** add the same "Free disk space" step before the Nix install in `fix` and `fix-gate`; log `df -h` after the copy so a full disk is
named. (Do not replace the copy with hard links: the isolated command could then write through them into the trusted tree.)

## Info

### IN-01: The run-listing window is capped at 1000 results

**File:** `.github/workflows/release-train.yml:182-183`
**Issue:** GitHub documents that the workflow runs endpoint returns at most 1000 results when `event` (or `status`, `branch`, ...) is used. The
guard filters with `event=workflow_dispatch`, so after 1000 newer dispatch runs the earlier `fix` runs fall out of the window and the budget for an
old key resets. Needs sustained dispatch volume, so low risk today.
**Fix:** also read `total_count` from the first page and fail when it exceeds the number of runs returned.

### IN-02: A derive failure or an invented key re-opens the budget in two directions

**File:** `.github/workflows/release-train.yml:51, 119-185`, `scripts/release-train.mjs:465-468`
**Issue:** The run title is set from the inputs before `derive` validates them, and `fixAttempts` counts titles. A dispatch that dies in `derive` after
the title is formed with a well-formed key/class/attempt (for example the branch check `gh api .../branches/$BRANCH` fails on a typo) still counts as a spent attempt, so one typo
costs half the budget. Conversely the budget is per (key, class); any key greater than the latest Release is admitted, so the dispatcher can reset it by
naming a new key. Both need a human with write access, so informational.
**Fix:** count a run only when its `fix` job started (read jobs for the run) or document that a failed dispatch spends an attempt.

### IN-03: fix-pr's git calls and `publish-bump-branch.sh` do not neutralise system git config or attributes the way `fixer-prepare.sh` does

**File:** `.github/workflows/release-train.yml:1027` (`T()`), `scripts/publish-bump-branch.sh:60,64`
**Issue:** `fixer-prepare.sh` runs git with `GIT_CONFIG_NOSYSTEM=1`, `core.attributesFile=/dev/null`, `--no-ext-diff --no-textconv`. `T()` sets only hooks and fsmonitor,
and runs on a runner whose system gitconfig (git-lfs is installed system-wide on GitHub images) defines a `filter.lfs` driver. A `.gitattributes` already in the base tree
that selects it would change what `apply --index` and `commit` store compared to the plain-bytes diff the gate judged. The base tree is the target branch (owner/Renovate
authored, the gate forbids changing `.gitattributes`), so I did not build a case; it is an unneeded asymmetry.
**Fix:** `T() { GIT_CONFIG_NOSYSTEM=1 GIT_CONFIG_GLOBAL=/dev/null git -C target -c core.hooksPath=/dev/null -c core.fsmonitor=false -c core.attributesFile=/dev/null "$@"; }` and the same env for the push in `publish-bump-branch.sh`.

### IN-04: The Read grants are redundant with the working-directory default, and `upstream/` carries symlinks the scoping does not account for

**File:** `.github/workflows/release-train.yml:872-873`, `scripts/fixer-prepare.sh:95-103`
**Issue:** Headless Claude Code already reads inside its working directory; `Read(work/**)`, `Read(fixer-data/**)`, `Read(upstream/**)` mostly document intent, and the
deny list is what bounds the tree. `Read(upstream/**)` exposes the public Firefox checkout and the overlay symlinks `fetch-upstream.sh` creates
(`upstream/powerbrowser -> ../powerbrowser`, `upstream/identity.configure -> ../generated/...`), which resolve to public repository files, so nothing sensitive. But prep now
applies the target's patch stack to `upstream/`, and a patch can create a symlink there (`new file mode 120000`). Whether a read through it to a path outside the working
directory is refused depends on Claude Code's symlink resolution, which the repo asserts nowhere. No symlink in `work/` can escape (prep refuses them).
**Fix:** after the prep apply, `find upstream -type l` and fail on any link whose target is absolute or leaves the repository, with the three overlay links as the derived expected set.

### IN-05: The isolation self-test's "already isolated" branch checks state, not mechanism

**File:** `scripts/fixer-isolate.sh:87-97` (the `strategy` = none branch of `self_test`)
**Issue:** When `strategy` is `none` the test passes if the ambient process happens to have no non-loopback interface, `NoNewPrivs:1`, empty `CapEff` and no `GITHUB_*` variables.
A container started with `--network none --security-opt no-new-privileges --cap-drop ALL` passes without the wrapper being able to isolate anything, and the row is inside `--quick`.
**Fix:** only take that branch when `FIXER_ISOLATED=1`, which the wrapper exports into the command it runs, so only a real nested run qualifies.

## Claimed fix -> verified / not verified

| Claim (REVIEW-FIX) | Result | Basis |
| --- | --- | --- |
| CR-01 install.cjs and `--version` smoke check (c6a104d2) | verified | Reproduced the stub error after `npm ci --ignore-scripts`, then `2.1.314 (Claude Code)` after `install.cjs` |
| CR-02 digest/base binding, static re-run in fix-pr, isolated executing stages | verified for the bytes chain (diff-sha256, base-sha, no run-id, static re-run); not verified for the isolation: userns form exercised, sudo form unrun and likely loses PATH (WR-04), userns keeps groups (WR-03), same-uid control files reachable (WR-02), stage results forgeable (WR-05) | Read of all three jobs; gate run through the wrapper; isolation probes |
| CR-03 fix-pr runs main's scripts, target under `target/`, one token step | verified | Read; checkout rules; no target script runs; git hooks/fsmonitor off, fresh config (IN-03 residual) |
| CR-04 live budget and FIX-01 guards in derive | not verified in full: guard logic and anti-craft verified, but a failed-job re-run bypasses it (WR-01); live run listing unrun; 1000-result window (IN-01) | `--self-test`, reading, `run_attempt` grep |
| CR-05 gate worktree gets the ignored inputs | verified | Docs-only control passes all 8 stages through the wrapper; `CLAUDE.md` plant rejected at `[path]` |
| WR-01 `fixer-gate` rule with 26 plants | partially verified: the rule exists and its plants pass, but three further plants survive (WR-06) | Plants against the real file |
| WR-02 Read scoping and no job token on disk | verified as written; the grant is not what bounds the tree (IN-04) | Read of `claude_args`, `persist-credentials` |
| WR-03 anchored grammars for branch/fingerprint/attempt | verified | Read of `fixerInputsCheck`/`plainBranch`, self-test |
| WR-04 inert PR body, hunk-aware stat | verified | Read; self-test; quoted-name diff rejected by the gate |
| WR-05 log by the fingerprint's run, HEAD equals fingerprint sha | verified | Read of the log step and the `base` step |
| WR-06 App token without issues write, rule sees it | verified | Read; token step grants exactly contents and pull-requests write |
| WR-07 nonce-fenced log | verified | Read; nonce created after the log exists, lines containing it dropped |
| WR-08 F1 refused, prep applies the stack | verified for the refusal; prep apply not run (needs a fetch); IN-04 symlink note | Read |
| WR-09 RELEASING.md matches what is live | not verified: line 592-593 states a re-run is refused, which is false for a failed-job re-run (WR-01) | Read |
| IN-01 `.gitattributes` compared as files | verified | `fixer-prepare.sh --self-test` PASS (shim proves no git call) |
| IN-02 fix-pr signals refuse / no-op | verified | Read of the apply and publish steps |
| IN-04 symlinks in `work/` refused at prep | verified | `fixer-prepare.sh --self-test` plant and control |
| Verification section: self-tests, real gate control and deny plant | verified | Re-run here, same results |

---

_Reviewed: 2026-10-31_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: deep_
