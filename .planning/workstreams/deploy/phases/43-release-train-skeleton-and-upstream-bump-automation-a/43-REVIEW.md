---
phase: 43-release-train-skeleton-and-upstream-bump-automation-a
reviewed: 2026-10-31T00:00:00Z
depth: standard
files_reviewed: 8
files_reviewed_list:
  - .github/workflows/release-train.yml
  - .github/workflows/rebase-upstream.yml
  - scripts/detect-upstreams.mjs
  - scripts/release-train.mjs
  - scripts/verify-workflows.mjs
  - scripts/verify-platform.sh
  - docs/BUILD.md
  - docs/RELEASING.md
findings:
  blocker: 1
  warning: 9
  info: 4
  total: 14
status: issues_found
---

# Phase 43: Code Review Report

**Branch:** dsh/phase-43 (diff 186f465..HEAD)
**Checks run:** `verify-platform.sh --only` detect-upstreams-self-test, release-train-logic-self-test, workflows, workflows-self-test, zizmor, and `--quick`: all green. Green here means the checks pass, not that the workflow is correct; several of them cannot go red for the defects below.

## Summary

The trust shape is mostly sound: inputs reach `run:` only through `env:`, tags that reach git are re-validated against a strict regex, the App token is minted only in `bump-pr`, it is scoped to one repository with contents and pull-requests write, and `persist-credentials: false` is used. The defects are in the live behaviour of `bump-pr` (it re-publishes and force-pushes on every tick), in dry-run proving nothing, in pipe/exit masking that the pipefail fix did not reach, and in self-test plants that are tautological or exercise functions the workflow never calls.

## Critical Issues

### CR-01: bump-pr force-pushes a fresh commit to the bump branches on every tick, destroying owner commits and re-running CI

**File:** `.github/workflows/release-train.yml:316-318, 369-371` (decision inputs at 244, 296; commit at 315, 355)
**Issue:** `detect` reports a candidate for as long as the pin in `configuration.toml` is older than the newest tag, and for Node for as long as the newest v24 entry exists at all (see WR-08). Nothing consults whether `chore/esr-<tag>` or `chore/node-v24.x` already has an open PR (the `derive` facts are fixture-backed, BLOCKED.md item 3). So every hourly tick while the PR waits for the owner re-replays the candidate, creates a new commit (new committer timestamp, therefore a new SHA even when the tree is identical), and runs `git push --force` to the same branch.
Failure scenario: the first bump PR opens. verify.yml goes red (BUMP_RED) and the owner pushes a fix commit to `chore/esr-<tag>`. Within the hour the next tick force-pushes the bot's commit over it and the owner's fix is gone. Even with no owner action, every tick restarts verify.yml on the PR and invalidates any review. The comment "this job's own branch, recomputed from the base on every run" states the clobbering as intent, but the owner is invited to work on that branch (the PR is the merge gate).
**Fix:** Before pushing, compare against the remote branch and skip when nothing changed, and never overwrite foreign work:
```sh
REMOTE_TIP=$(git ls-remote origin "refs/heads/${BRANCH}" | cut -f1)
if [ -n "$REMOTE_TIP" ]; then
  git fetch --depth=1 origin "$BRANCH"
  # same tree: nothing to publish
  [ "$(git rev-parse HEAD^{tree})" = "$(git rev-parse FETCH_HEAD^{tree})" ] && { echo "release-train: NOTE -- ${BRANCH} already carries this tree"; exit 0; }
  # a commit not authored by the bot: the owner is working here; do not overwrite
  [ -n "$(git log --format=%an "$BASE..FETCH_HEAD" | grep -v '^release-train$')" ] && { echo "release-train: NOTE -- ${BRANCH} has owner commits; leaving it"; exit 0; }
fi
git ... push --force-with-lease="refs/heads/${BRANCH}:${REMOTE_TIP}" origin "HEAD:refs/heads/${BRANCH}"
```
Apply the same to the Node branch. Better: have `derive` (or `detect`) read `gh pr list --head chore/esr-<tag>` and not enter `bump` when a PR is open; that is also what the BUMPING state exists for.

## Warnings

### WR-01: A live run with a candidate ends red after the side effects, every tick, until the owner merges

**File:** `.github/workflows/release-train.yml:401-405`
**Issue:** The `report` job unconditionally `exit 1` when `!dry-run && candidate != ''`. The candidate persists until the bump PR is merged, so the sequence per tick is: re-replay (nix, up to 120 min), force-push (CR-01), red `report`. BLOCKED.md item 3 calls this the intended failure mode, but it makes the hourly clock unusable (a permanently red scheduled workflow is exactly the failure D-77 cites) and it runs after the PR was already published, so "leave nothing without a tracking view" is not achieved either.
**Fix:** Do not put the Worker clock on this workflow until the writer is wired, or make the refusal happen before `bump-pr` (a guard in `derive` that stops a live candidate run when the writer is not wired), so no write precedes the refusal.

### WR-02: Pipe and command-substitution exit statuses are still masked in release-train.yml

**File:** `.github/workflows/release-train.yml:205, 136, 228`
**Issue:** Steps without `shell:` run `bash -e {0}`, which has no `pipefail`; `set -eu` does not add it, and da0b7a6 fixed only the `tee` step in rebase-upstream.yml. Line 205 `node scripts/detect-upstreams.mjs --node-select ... | tee -a "$GITHUB_OUTPUT"` takes tee's status: a node crash (unparseable index.json -> `JSON.parse` throws at detect-upstreams.mjs:269) leaves the step green with empty outputs, which the next steps read as "no Node 24 line, hold". The Node half silently stops working. Line 136 `echo "pin=$(node ... --pin)"` discards the failure of the substitution, so the real error (manifest unreadable) is replaced by a later, misleading "tag listing is empty". Line 228 is caught only by the empty check that follows it.
**Fix:** add `set -euo pipefail` at the top of each multi-command `run:` (or `shell: bash` on the job defaults), and write `PIN=$(node scripts/detect-upstreams.mjs --pin); echo "pin=$PIN" >> "$GITHUB_OUTPUT"`; replace `| tee -a` with `node ... > "$RUNNER_TEMP/sel.txt"; cat "$RUNNER_TEMP/sel.txt" >> "$GITHUB_OUTPUT"`.

### WR-03: Dry-run decides nothing, contradicting the header and the owner checkpoint that relies on it

**File:** `.github/workflows/release-train.yml:24-27, 150-153, 179-183, 200-203, 266-273`
**Issue:** The header says "A dry run still validates, decides and replays". In the file a dry run skips the tag listing, skips the advisory read, forces `candidate=` empty, skips the Node index fetch and verification, so `bump` is skipped and `bump-pr` prints `candidate=''` and `node=''`. BLOCKED.md item 2 tells the owner to "dispatch with `dry-run: true` and read the printed would-write lines before a live dispatch": those lines are always empty, so the dry run gives no information about what a live run would open, and the first real exercise of listing, replay, Node verification and push is the live run. The `dry-run-gate` rule cannot detect this because it only checks that write steps are gated.
**Fix:** Let read-only steps run in dry-run (the `git ls-remote`, the advisory curl, the Node index and gpgv verification are all reads), carry the real candidate and Node line into `bump`, and gate only the writes (token mint, push, `gh pr`). Print `would open chore/esr-<tag>` with the actual values.

### WR-04: Dispatched `tag` and `release` are validated and then ignored; validation is line-based

**File:** `.github/workflows/release-train.yml:46-53, 94-105`
**Issue:** `derive` validates `TAG` and `RELEASE` but exposes only `reason` as an output; `detect` never reads `inputs.tag`. An owner who dispatches `tag=<newer ESR tag>` to force a bump gets the detector's own decision (possibly none) and no error. The plan's must-have that the release tuple be strictly greater than the latest Release tag is replaced by a NOTE (line 104). Separately, `printf '%s\n' "$TAG" | grep -Eq '^...$'` matches any single line of a multi-line value, so a dispatch via the API with an embedded newline passes validation (harmless today only because the value is unused).
**Fix:** either remove the two inputs until a consumer exists, or pass them through (`outputs.tag`) and have `detect` use the validated tag as an override; validate with `[[ $TAG =~ ^...$ ]]` or `grep -xE` on a value with no newline.

### WR-05: Failure domains are coupled and an advisory value is a hard dependency

**File:** `.github/workflows/release-train.yml:168-170, 211-240, 244`
**Issue:** (a) `curl -fsSL ... firefox_versions.json` for the advisory-only `FIREFOX_ESR` runs under `set -e`; a product-details outage fails `detect`, and `bump` (no `always()`) is then skipped, so an advisory value blocks a real ESR bump. (b) Any Node verification failure (nodejs.org, the release-keys clone, a signature mismatch) also fails `detect` after `candidate` is set, so `bump` is skipped and the ESR bump is blocked by the Node half; then `bump-pr` still runs with `node-version` set and `node-sha256` empty and only fails on the sha regex at line 307. The spec treats the two halves as independent.
**Fix:** make the advisory read non-fatal (`|| true`, empty value), and split Node detection into its own job (`detect-node`) so `bump` needs only the ESR detector; have `bump-pr` gate the Node step on `needs.detect-node.result == 'success'` and a non-empty sha rather than on the version alone.

### WR-06: The dry-run-gate rule has detection gaps, and `includes()` accepts any mention of the gate

**File:** `scripts/verify-workflows.mjs:112, 333-336`
**Issue:** `WRITE_RUN` does not match `git -c "...extraheader..." push` (the form the real publish steps use; I checked: `false`), `gh api --method POST`, `gh api ... -f` (implicit POST), `gh pr close|ready|review`, `gh release create`, `gh label`, or `curl -X POST`. The real publish steps are only caught because they also contain `gh pr create|edit`. The gate test is `cond.includes('inputs.dry-run')`, so `if: ${{ inputs.dry-run }}` (inverted: runs only in dry-run) or `if: ${{ always() || inputs.dry-run }}` passes. Only `create-github-app-token` is recognised among `uses:` writers (no `actions/github-script`, no PR-creating actions). The self-test plants only the case "no `if:` at all" with `git push`, `gh issue comment` and the App-token mint, so none of these gaps can show red.
**Fix:** match `\bgit\b[^\n]*\bpush\b`, `gh api` with `-X|--method|-f|-F|--input`, any `gh (pr|issue|release|label|workflow) (create|edit|close|merge|comment|ready|review|run)`, `curl[^\n]*-X\s*(POST|PUT|PATCH|DELETE)`; require the gate to be a negation (`/!\s*inputs\.dry-run/` or `inputs.dry-run != true|== false`) and add self-test plants for an inverted gate and for the `git -c ... push` form.

### WR-07: Several release-train self-test plants cannot go red from the code under test; the guarded functions are not used by the workflow

**File:** `scripts/release-train.mjs:262, 344-349, 206-224, 156-169, 182-203`
**Issue:**
- Line 262: `next(got)` returns `ACTIONS[got]` and is compared with `ACTIONS[name]`, the same map; this assertion is a tautology and cannot fail unless `next` is broken in a way that never occurs.
- Lines 344-349: the "writes under the patch directory" plant builds `planted` by overriding `writes` with a literal path, then reports it. It reports a failure unconditionally; `renderConflict`'s real output is never asserted to have an empty `writes`. The rule "the conflict path never edits a patch" (plan must-have) is therefore not enforced by anything. There is also no green control for it.
- `admitWakeRun`, `classifyRelease`, `findExactlyOne`, `renderConflict`, `conflictStageReason` have no caller other than the self-test; the workflow only runs `--self-test`. The "fork-head workflow_run" and "draft Release" plants prove helper functions; the real defences (the YAML `if:` guard, and the later Release listing) are not exercised by them. The fork guard is covered separately by verify-workflows, but the draft-Release and exactly-one rules have no production path at all until Phase 50 / BLOCKED.md item 3.
- `FIXTURES`, `BASE_PIN` and the expectations are hand-kept in the same file as the implementation (the CLAUDE.md derive-and-compare rule); the state/fixture set-equality is sound, but nothing ties `ACTIONS` keys to `STATES` keys.
**Fix:** assert `renderConflict(...).writes.every(w => !w.startsWith('patches/'))` on the real return value and plant it by mutating the function's output via an injected dependency; replace line 262 with an independent expected-action table in the fixtures (`{ facts, state, action }`); assert `Object.keys(ACTIONS)` set-equals `Object.keys(STATES)`; mark the unwired functions as such in the registry comment so a green row is not read as production coverage.

### WR-08: ESR pin move can silently do nothing, new files are never staged, and the Node line is chosen without comparing it to the pin

**File:** `.github/workflows/release-train.yml:342, 349, 354, 204-205`; `scripts/detect-upstreams.mjs:269-272`
**Issue:** (a) `sed -i "s/^firefox_esr_tag = \".*\"/.../"` has no assertion that it changed anything; if the line shape differs (a trailing comment containing a quote makes `.*` consume to the last quote) the pin does not move, `generate.mjs` emits nothing, and the step ends in `no PR` with exit 0, a green run that will repeat forever. (b) `git add -u` stages tracked modifications only; any tracked surface the generator or replay newly creates (a new version file, a new generated target) is silently left out of the commit. (c) `--node-select` outputs the newest v24 even when it equals or is older than the pin in `node-runtime.json`; the compare logic in `decide()` (`nodePin`, lines 179-185) is never called by the workflow. So every tick clones release-keys, downloads the tarball, mints an App token, and only then discovers via `git diff --cached --quiet` that nothing changed; a registry that ever lists a lower v24 as newest would produce a downgrade PR.
**Fix:** after the `sed`, `grep -qx "firefox_esr_tag = \"${TAG}\"" configuration.toml || exit 1`; replace `git add -u` with `git add -A -- configuration.toml powerbrowser patches` followed by a check that `git status --porcelain` outside those paths is empty (excluding ignored `upstream/` and `generated/`); pass the current pin to `--node-select` (or call `decide`) and emit an empty version unless the selected tuple is strictly greater.

### WR-09: The App-token job is entered on every tick, including no-op and dry-run runs

**File:** `.github/workflows/release-train.yml:253-264`
**Issue:** `bump-pr` has `environment: bot` and `always()`, so every dispatch (including dry-run and runs where `derive` failed validation) creates a deployment to `bot`. Today `environment-bot.json` has only a branch policy, so nothing blocks, but the BLOCKED.md and the plan describe a reviewer rule for `bot`; with one, every hourly tick would sit waiting for an approval and hold the single `release-train` concurrency slot (no cancel), starving every later tick. The job also reads `needs.detect.outputs.*` after a failed `detect`.
**Fix:** put the environment-bound job behind a real condition (`if: needs.bump.result == 'success' || needs.detect.outputs.node-version != ''` with the dry-run and failed-`derive` cases excluded), so that a run with nothing to publish never enters `bot`.

## Info

### IN-01: The base64 of the App token is not registered as a secret

**File:** `.github/workflows/release-train.yml:316, 369`
**Issue:** `AUTH=$(printf 'x-access-token:%s' "$TOKEN" | base64 -w0)` is a derived value that GitHub does not mask. It is not printed today, but any later `set -x`, git trace or error that echoes the `-c http...extraheader` argument would expose a usable credential (the actions/checkout implementation masks the same value).
**Fix:** `echo "::add-mask::$AUTH"` immediately after computing it.

### IN-02: Dead workflow_run code paths while the wake is held out

**File:** `.github/workflows/release-train.yml:66, 88-89, 116, 244, 258, 379`
**Issue:** With no `workflow_run` trigger, the `workflow_run` halves of every job `if:` and the `EVENT = workflow_run` branch can never be true. They are the guards the `workflow-run-guard` rule was built to check, now guarding nothing real; the self-test plant adds the trigger itself, so the rule stays tested. Recorded owner decision in BLOCKED.md item 1; noted so the dead branch is deleted if option B is taken.
**Fix:** on BLOCKED.md option B, delete the guards and the `EVENT` branch.

### IN-03: Unpinned third-party keyring and no binding of the signature to a named signer

**File:** `.github/workflows/release-train.yml:220-227`
**Issue:** `git clone --depth 1 https://github.com/nodejs/release-keys.git` takes whatever `HEAD` is, imports every `*.asc` in `keys/` and `gpgv` accepts a good signature from any of them. A change to that repository changes who is trusted, with no pinned commit or fingerprint list in this repo. Accepted risk given the upstream trust model, but the docs now state this chain as the provenance and the owner reviewing the PR cannot see which key signed.
**Fix:** clone at a pinned commit recorded in the repo (or a fingerprint list checked with `gpgv --status-fd 1 | grep VALIDSIG`), and print the signer fingerprint into the PR body.

### IN-04: The `--quick` gate and an apply-log fence break

**File:** `.github/workflows/release-train.yml:341-346`; `scripts/release-train.mjs:189-197`
**Issue:** (a) The plan's requirement that the replayed tree pass `--quick` is not met (declared in 43-04-SUMMARY as a scope note): the pushed ESR tree is only gated by the rebase workflow's surface check, brand scan and identity checks plus pin checks; the owner sees `--quick` only through verify.yml on the PR. (b) `renderConflict` wraps the apply log and the upstream diff in triple-backtick fences without escaping; log text containing a fence closes the block and can inject markdown or an `@mention` into the issue body. Not reachable yet (no writer wired).
**Fix:** (a) run `scripts/verify-platform.sh --quick` in the replay step before committing; (b) use a fence longer than any backtick run in the content, and strip `@` mentions from the excerpt.

---

_Reviewed: 2026-10-31_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
