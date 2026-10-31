---
phase: 52-claude-fixer-f
plans: [52-03, 52-04]
fixed_at: 2026-10-31T00:00:00Z
review_path: .planning/workstreams/deploy/phases/52-claude-fixer-f/52-03-04-REREVIEW.md
iteration: 2
findings_in_scope: 12
fixed: 12
skipped: 0
status: all_fixed
---

# Phase 52 plans 52-03 and 52-04: second code review fix report

Scope: WR-01..WR-07 and IN-01..IN-05 of the re-review. Branch dsh/phase-52.

Step 0 merged `origin/workspace/deploy` first (commit 0bf667c9): Phases 48, 51 and 54 to 57 came in. `release-train.yml`,
`release-train.mjs` and `verify-workflows.mjs` were unioned: the SUPERSEDED provenance rules and the maintenance sweep stay; the fixer
state NEEDS_OWNER stays (19 states in the set-equal tables: 15 bump-lane including NEEDS_OWNER and SUPERSEDED, and the 4 uptake
states); `sweep-clock` gained the `reason != fix` gate; the `fix` job gained the `dependabot[bot]` actor exclusion (the dispatch
form of the Phase 51 guard); the fixer's release-key grammar is now `FIX_KEY_RE` so it does not shadow the train's `KEY_RE`; the
`derive` wrapper kept `fixAttempts` while the superseded-train logic moved into `deriveBase`. `generate` was re-run and staged, and
`patches-regenerated` was made green by re-applying patch 040's three NSIS files in `upstream/` (nothing under `upstream/` is committed).

Where two findings touch the same lines (one file edited for both), they share a commit; each finding is named in the message.

## Findings

- WR-01 FIXED 3966a091. `github.run_attempt == 1` is a top-level `&&` term of the `if:` of `fix`, `fix-gate` and `fix-pr`; the `fixer-gate`
  rule requires it with one plant per job. `docs/RELEASING.md` and the first review-fix report now say what is enforced where
  ("Re-run all jobs" by the derive job, "Re-run failed jobs" by the three `if:` terms).
- WR-02 FIXED 26dfdb1d. `scripts/fixer-isolate.sh` runs the command in a mount namespace in which every mount is remounted read-only except
  a per-run scratch directory (which also stands in for `/tmp` and `/var/tmp`, and holds `TMPDIR` and `HOME`). `GITHUB_ENV`, `GITHUB_PATH`,
  `GITHUB_OUTPUT`, `GITHUB_STEP_SUMMARY`, `GITHUB_STATE` and their directory are also bound read-only by name before the environment is
  scrubbed. The self-test plants a write to a file-command path (with and without the variables naming it) and requires `Read-only file system`.
- WR-03 FIXED 26dfdb1d. The unprivileged-userns form cannot clear supplementary groups (setgroups is denied there), so every unix socket file under
  `/run`, `/var/run`, `/dev/shm` and `$XDG_RUNTIME_DIR` is masked with a bind of `/dev/null`; the sudo form uses `setpriv --clear-groups` and the
  self-test requires an empty group list there. The self-test starts a live listener outside, shows it answers unisolated, and requires the isolated
  connect to fail (`ECONNREFUSED`). Same-uid sockets outside those directories remain reachable (stated in the script).
- WR-04 FIXED 26dfdb1d, f5e2b4e9. The sudo form is `sudo -n -E env "PATH=$PATH" ... unshare ... setpriv --reuid --regid --clear-groups
  --inh-caps=-all --bounding-set=-all --no-new-privs`, the option order of the `setpriv(1)` "more restrictive setup" example. A missing `ip` prints a
  NOTE; the wrapper prints which `node`, `yarn` and `makensis` the command resolves. The self-test runs the sudo form when `sudo -n true` succeeds
  and otherwise prints `UNTESTED  sudo form UNTESTED here` and carries that into its PASS line. No form working still fails closed. This host has no
  passwordless sudo, so the sudo form is UNTESTED here (BLOCKED.md item 6).
- WR-05 FIXED 26dfdb1d. The trusted script overlay (`scripts`, `inventory`, `.github`, the two baselines and `flake.lock`) is a read-only bind mount
  of the trusted checkout inside the gate's worktree: the wrapper makes the mount points under `$FIXER_SCRATCH/tree`, and the gate builds its worktree
  around them (a fresh repository over the trusted objects through git alternates, with the bound names sparse-excluded) instead of copying the overlay.
  The self-test plants a write to an existing overlay file and a new file in an overlay directory. The wrapper, the gate header and RELEASING.md state that
  stages 5 to 8 are advisory and that `fix-pr`'s static re-run on the hashed bytes is the binding check. The fix-gate job builds `makensis` before the
  isolation (`nix build nixpkgs#nsis`), because the confinement removed the ambient nix caches the `installer-build-proof-self-test` row relied on.
- WR-06 FIXED 6d106aa2. The `fixer-gate` rule refuses `continue-on-error`, `|| true`, `|| :`, `|| exit 0`, `; true` and `set +e` on the steps that re-gate, apply and
  publish in `fix-pr`; requires one job variable `FIX_DIFF` read by the hashing step, the `--static-only --diff=`, `apply --index` and `fix-open-pr.mjs --diff=` (a literal
  `work.diff` or another file goes red); and requires the `fix` job's `diff-sha256` to come from a step that runs `sha256sum` on `work.diff` after the emit step and its
  `base-sha` from the step that reads the prep's `base-sha` after the prep and before the model. 14 plants.
- WR-07 FIXED b0098819. `fix` and `fix-gate` run the same `Free disk space` step as `rebase-upstream.yml` before the fetch; the rule reads the expected text from that
  workflow and checks order, with 3 plants. The gate logs `df -h` after its copies. Measured (reference host, btrfs with reflink, `upstream/` 5.6 GB): `cp -a
  --reflink=auto` took 68 s and added 1.0 GiB used; `--reflink=never` took 48 s and added 3.3 GiB. The scratch directory is on the trusted checkout's filesystem, so a
  reflink-capable filesystem shares the extents. A hosted runner's ext4 has no reflink: there the second copy is real and the disk-freeing step is the mitigation (not measured on a runner).
- IN-01 FIXED 7223cfdc. The derive job reads the earlier dispatch runs as one query per dispatching actor (the owner and the actor of the run) and passes them through
  `release-train.mjs --run-titles`, which refuses a list returned shorter than its `total_count` (the 1000-result cap) instead of counting fewer runs; 2 plants, 2 controls.
- IN-02 FIXED 7223cfdc. The run-name carries the fingerprint and `fixAttempts` counts per key, class and fingerprint; `fixerInputsCheck` refuses a release key whose ESR groups are
  not the target tag's (`key-not-current`); the workflows rule requires the run-name format and the checked reader. A dispatch that dies in derive after its title was formed still
  spends an attempt: documented in RELEASING.md rather than changed.
- IN-03 FIXED 6d106aa2. `fix-pr`'s git helper and `publish-bump-branch.sh` run with `GIT_CONFIG_NOSYSTEM=1`, `GIT_CONFIG_GLOBAL=/dev/null`, `core.attributesFile=/dev/null` and
  hooks and fsmonitor off; the rule requires each in the helper, with 3 plants. `publish-bump-branch.sh` has no self-test: a stubbed `gh` and a local bare remote showed a create still pushes.
- IN-04 FIXED 75ee2b65. `Read(upstream/**)` is no longer granted and is denied (the two remaining grants, `work/**` and `fixer-data/**`, are scoped); the prompt says so. After the
  patch apply, `fixer-prepare.sh` refuses any symlink added or changed in `upstream/` (compared with the snapshot taken after the fetch, so the expected overlay links are derived, not listed)
  and any link resolving outside the repository; 4 self-test cases.
- IN-05 FIXED 26dfdb1d. The self-test's nested branch runs only when the wrapper set `FIXER_ISOLATED=1`, and checks effects: no interface but `lo`, `NoNewPrivs`, no capability, no
  `GITHUB_*`/`ACTIONS_*`/`RUNNER_*`, a write beside the script, to `/etc` and to the directory holding the scratch directory all refused, `TMPDIR` writable. A container with no network no longer qualifies.

## Verification

Run in this clone (`dsh/phase-52`, the main checkout of the clone, not an isolated worktree of this agent; the gate's own worktree is under the wrapper's scratch directory in `.git/`). The isolation used its unprivileged
user-namespace form.

- Real gate, docs-only control (`docs/CUSTOMIZE.md`, one added line), `nix develop .#theia --command bash -c 'PATH="$NSIS_BIN:$PATH"; bash scripts/fixer-isolate.sh -- node scripts/verify-fix-gate.mjs --diff=<diff> --tag=FIREFOX_153_5_1esr_RELEASE --ref=<HEAD>'`:
  `fix-gate: PASS -- verdict: pass; 1 path(s) gated ..., every stage green` (stages 1 to 8, `verify-platform.sh --quick` inside the isolation), exit 0, 988 s on this loaded host (533 s on an earlier run).
- Real gate, deny plant (`CLAUDE.md`, one added line), same command: `verdict: reject`, `[path] "CLAUDE.md" matches the deny entry 'CLAUDE.md'`, exit 1.
- Self-tests, all PASS: `release-train.mjs` (19 states, 63 plants, 61 controls, maintenance half 67), `verify-fix-gate.mjs` (37 plants, 3 controls plus the overlay and tree cases), `fix-open-pr.mjs`,
  `fixer-prepare.sh`, `fixer-isolate.sh` (userns strategy; sudo form UNTESTED here), `verify-workflows.mjs` (204 plants, 11 controls). `publish-bump-branch.sh`: syntax check and a stubbed push only.
- `verify-platform.sh --only workflows`, `workflows-self-test`, `zizmor`, `release-train-logic-self-test`: all PASS. `node scripts/generate.mjs --check`: PASS.
- Full `scripts/verify-platform.sh --quick` (with this report and the re-review staged): exit 0, `verify-platform: PASS -- all checks passed`.

Not proven: the sudo form of the isolation, the read-only remount of every mount on a hosted runner, the `nix build nixpkgs#nsis` step, the free-disk step and the per-actor run listing on a hosted runner;
IN-01's behaviour against the real runs endpoint. They are listed in BLOCKED.md item 6.

---

_Fixed: 2026-10-31_
_Fixer: Claude (gsd-code-fixer)_
_Iteration: 2_
