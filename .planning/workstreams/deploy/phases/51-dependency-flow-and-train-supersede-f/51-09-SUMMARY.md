---
phase: 51-dependency-flow-and-train-supersede-f
plan: 09
subsystem: release-train
status: complete
gap_closure: true
tags: [auto-02, renovate, licensing, security]
requires:
  - 51-08
provides:
  - renovate-licensing (generate, no credential) and renovate-licensing-publish (App token) in release-train.yml
  - publishPlan expected-tip pin and committer check
  - workflows rule renovate-job for the split shape
key-files:
  modified:
    - .github/workflows/release-train.yml
    - .github/renovate.json5
    - scripts/publish-bump-branch.sh
    - scripts/release-train.mjs
    - scripts/verify-workflows.mjs
    - docs/RELEASING.md
    - .planning/workstreams/deploy/phases/51-dependency-flow-and-train-supersede-f/BLOCKED.md
    - .planning/workstreams/deploy/phases/51-dependency-flow-and-train-supersede-f/51-08-SUMMARY.md
decisions:
  - "The data files taken from the branch are the generator's inputs that Renovate writes: theia/package.json (resolutions), theia/yarn.lock, configuration.toml (theia_release). theia/applications/browser/package.json and powerbrowser/packaging/node-runtime.json are generator inputs Renovate does not write, so main's copies are used; a branch that changes any other path is not regenerated (NOTE)."
  - "The head SHA travels as a job output, not inside the artifact: outputs come from the trusted step, the artifact carries only the two notice files and is checked to hold exactly those."
  - "The moved-branch refusal is in two places: the commit step compares the fetched tip to HEAD_SHA before any token exists, and publish-bump-branch.sh's third argument makes publishPlan refuse unless the API tip is HEAD_SHA, so the force-with-lease is pinned to it too."
  - "GitHub's verified flag is not required: Renovate (platformCommit disabled) and the bot commit unsigned over git, so the flag is false on every legitimate commit. publishPlan now checks the committer address as well as the author; an address is still a claim anyone with push access can make. Residual recorded in BLOCKED.md item 18."
  - "The publish job's git helper lists core.attributesFile first so its text differs from fix-pr's helper; the fix-pr plant anchors on that helper's tail."
metrics:
  completed: 2026-11-04
---

# 51-09 summary: renovate-licensing split (no branch code with the App token)

## What changed

- `.github/workflows/release-train.yml`:
  - `renovate-licensing` (generate): `permissions: {}`, no environment, no App token, no secret. Checks out the run's
    ref (main) without persisted credentials, fetches `chore/theia-theia`, records its head and the merge base with
    main, refuses (NOTE) a branch that changes anything but `theia/package.json`, `theia/yarn.lock`,
    `configuration.toml` (its `theia_release` line only) and the two notices, runs main's `fetch-upstream.sh` and
    `apply-patches.sh`, then `git checkout "$HEAD_SHA" -- theia/package.json theia/yarn.lock configuration.toml`,
    `yarn install --ignore-scripts --frozen-lockfile` and main's `generate-licensing.mjs` in `nix develop .#theia`.
    Current notices end with a NOTE; otherwise it uploads `renovate-licensing-notices` (the two files, retention 1 day)
    and outputs `head` and `base`.
  - `renovate-licensing-publish`: needs the generate job, gated on its `head` output, environment bot,
    `permissions: {}`, `continue-on-error: true`. Trusted checkout without persisted credentials; downloads the
    artifact and refuses one holding anything but the two files; fetches the branch and ends with a NOTE if its tip
    is not `HEAD_SHA`; adds a detached worktree `target/` at `HEAD_SHA` with `GIT_CONFIG_NOSYSTEM=1`,
    `GIT_CONFIG_GLOBAL=/dev/null`, hooks, fsmonitor and the attributes file off; copies the two files with
    `cp --remove-destination` (a symlink planted at a notice path is replaced, not followed); stages exactly those
    two; refuses any other diff; commits as `release-train <BOT_EMAIL>`. Only then is the App token minted
    (contents write), and `(cd target && bash "$GITHUB_WORKSPACE/scripts/publish-bump-branch.sh" "$BRANCH" "$BASE"
    "$HEAD_SHA")` publishes. Every run step starts with `unset NODE_OPTIONS`; the generate job's `GITHUB_ENV` and
    `GITHUB_PATH` writes do not cross jobs.
- `scripts/publish-bump-branch.sh`: optional third argument (expected remote tip); the compare also returns
  `committers`. The bump-pr, bump-pr-node and fix-pr callers pass two arguments and behave as before (their commits
  set the bot as committer through `git config user.email`).
- `scripts/release-train.mjs` `publishPlan`: `expectTip` (refuse when the remote tip differs), committer addresses
  checked with author addresses, a compare without `committers` refused as unlistable; CLI accepts the optional
  seventh argument. Three new plants; the existing fixtures carry `committers`.
- `scripts/verify-workflows.mjs` rule `renovate-job`: rewritten for the two jobs (header comment lists every
  assertion). 29 renovate-job plants (15 new, 4 re-anchored); 241 plants in total, 11 controls.
- `docs/RELEASING.md` Theia inflow paragraph and the `.github/renovate.json5` header name both jobs.

## Verification

- `node scripts/verify-workflows.mjs` and `--self-test`: PASS (241 plants, 11 controls).
- Rows `zizmor`, `zizmor-self-test`, `workflows`, `workflows-self-test`, `renovate-config`,
  `release-train-logic-self-test`: PASS.
- `bash -n` over the three new run blocks: clean.
- The publish job's commit step, extracted from the YAML and run against a scratch bare origin: pinned head commits
  the two files as the bot (author and committer), a symlinked notice path is replaced and its target not written;
  a moved tip ends with the NOTE; an extra artifact file fails the step.
- `node scripts/generate.mjs`; `scripts/verify-platform.sh --quick`: only `fixer-isolate-self-test` red (known).

## Not verified

- No live run (BLOCKED.md item 3). Whether Renovate's git commits carry the bot address as committer, not only as
  author, is unobserved; if not, publishPlan refuses the branch with a NOTE and the notices are regenerated by hand.
- That GitHub accepts a cross-job artifact from a `continue-on-error` job and that `needs.renovate-licensing.outputs.head`
  is readable after it: standard behaviour, not exercised here.
