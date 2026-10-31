---
phase: 52-claude-fixer-f
plan: 03
subsystem: infra
tags: [release-train, fixer-contract, needs-owner, fix-budget, dispatch-guards, fixer-spend, fixer-auth, wif, fixer-prepare]

requires:
  - phase: 52-claude-fixer-f
    plan: 01
    provides: the fix gate and its deny list
  - phase: 52-claude-fixer-f
    plan: 02
    provides: the fixer-pin, fixer-debug, fixer-tools and fixer-prompt rules
  - phase: 43-release-train
    provides: the reviewed release-train.mjs contract and release-train.yml (merged; this plan extends them)
provides:
  - NEEDS_OWNER state, the FIX_BUDGET transition and the FIX-01 dispatch derivation with every guard named
  - the seven-input dispatch map (DISPATCH_INPUTS) and fixerInputsCheck, run by the fix job before it acts
  - fixAttempts counting from fix run-names, gate-rejected attempts included
  - TRAIN-06 render: train:blocked, owner assignee, failing-log link; release.yml red renders no dispatch
  - fixer-spend and fixer-auth rules on the workflows row, with plants
  - scripts/fixer-prepare.sh (regen-only prep and work.diff emit)
  - docs/RELEASING.md Fixer authentication (FIX-12) section
affects: [52-04 fixer workflow jobs, Phase 43 train skeleton, Phase 53 triage]

actuals:
  tokens: 11720
  tasks: 3
  commits: 5
plan_head_before: 69659b446e1c91aa2654dbc59f5b5123f30b9e07
plan_head_after: 3b9e7388

tech-stack:
  added: []
  patterns:
    - "Fixer decisions are separate pure functions (fixerDispatch, fixAttempts, fixerInputsCheck); derive() keeps Phase 43's string return"
    - "Each refusal reason begins with its guard name, so a plant names the guard it trips"
    - "Self-test sections: derive, next and render each run their own cases; bare --self-test runs all"

key-files:
  created:
    - scripts/fixer-prepare.sh
  modified:
    - scripts/release-train.mjs
    - scripts/verify-workflows.mjs
    - docs/RELEASING.md

key-decisions:
  - "Phase 43 already merged release-train.mjs with a string-returning derive(). The fixer dispatch is fixerDispatch(facts), not derive() returning {state, dispatch}, so runChecks and wouldWrite keep their contract"
  - "NEEDS_OWNER is a STATES row. It is derived from the fixAttempts fact (absent means zero), so the live would-write path is unchanged"
  - "MAIN_RED (red main, FIX-01 class F3) is a dispatch-level state name, not a STATES row. Phase 43 has no main-verify state yet; the fixture is the F3 dispatch fixture"
  - "The fixer-auth ANTHROPIC_API_KEY confinement is scoped to release-train.yml. triage.yml holds its key in its own triage environment (Phase 53) and is outside this plan"
  - "The Claude step carries the federation ids as with: inputs; the rule asserts their presence, not their values (values are repository variables)"
  - "fixer-prepare.sh runs from the trusted root and passes explicit --upstream and --patches to regenerate-patches.sh. After the model runs it never runs git inside work/ and never reads work/.git: the diff is built from a pristine copy of the git directory taken before the model ran (see the security fix section)"

patterns-established:
  - "Plant anchors for the fixer fixture are built from the same constants the rules read (FIX_IF, GUARD, FIX_PIN), so a rule change moves the fixture with it"

requirements-completed: [TRAIN-06, FIX-01, FIX-05, FIX-12]

duration: one session
completed: 2026-10-31
status: complete
---

# Phase 52 Plan 03: Fixer contract, spend and auth rules, prep script

**The train contract now carries the fixer: NEEDS_OWNER after two fix runs, seven-input dispatch with every guard named, gate-rejected attempts counted, a spend rule and a credential rule on the workflows row, and the regen-only prep script.**

## Performance

- **Tasks:** 3, landed as 3 commits.
- **Files:** 1 created, 3 modified.
- **Realised diff:** 46,880 characters (about 11,720 tokens by the chars/4 rule).

## Accomplishments

- `scripts/release-train.mjs` gains NEEDS_OWNER (derived when a fixable red meets `fixAttempts >= FIX_BUDGET`, with FIX_BUDGET = 2), `fixerDispatch(facts)` (FIX-01: release.yml, fork, claude-fix/, bot actor, external author, class, target branch, budget, key-not-greater and fingerprint guards), `fixerInputsCheck` (the fix job's own re-check of its seven inputs), `fixAttempts(runs, key, cls)` (exact run-name match, verdict ignored), `keyGreater`, and `renderReleaseRed`. The TRAIN-06 render adds `train:blocked`, the owner assignee and the failing-log link for CONFLICT, BUMP_RED and NEEDS_OWNER.
- `node scripts/release-train.mjs --fixer-inputs <key> <class> <branch> <target-tag> <check@sha> <attempt> <latest-tag|''>` exits 0 on valid inputs and 2 on bad argument counts.
- `scripts/verify-workflows.mjs` gains `fixer-spend` (timeout-minutes 90, claude-fixer group) and `fixer-auth` (id-token on fix only, federation ids in the Claude step, no id-token on fix-gate or fix-pr, ANTHROPIC_API_KEY confined to environment fixer in release-train.yml). The good fixer triple now carries the federation ids and stays green.
- `scripts/fixer-prepare.sh`: `--tag=<gecko-tag> --state=<dir>` prep (fetch at the tag, pristine copy of work/.git, conflict-marker NOTE, baseline regenerate-patches --check over the target's patches), `--emit-diff --state=<dir> --out=<abs path>` (work.diff built from the pristine copy, upstream excluded, ignored paths forced in), and `--self-test` (planted git config, hook and attributes change refused). Negative paths fail closed with a Next step line. The first version of this script ran git inside work/; the security fix below replaced it.
- `docs/RELEASING.md` gains `### Fixer authentication (FIX-12)` after the GitHub Apps section. The outcome is WIF, the fallback is confined to the fixer environment, and the credential state is marked pending the 52-05 checkpoint.

## Task Commits

1. **Task 1 and the counter of Task 2: fixer contract** - `87b70761` (feat). The contract and the attempt counter sit in one file, so they land together.
2. **Task 2: fixer-spend rule** - `1b80a4c3` (feat)
3. **Task 3: fixer-auth rule, fixer-prepare, FIX-12 docs** - `db1de9c9` (feat)

## Verification

- `node scripts/release-train.mjs derive --self-test`: `release-train-logic: --self-test PASS -- 6 states set-equal to 6 fixtures, 22 planted faults went red naming their drift, and 13 controls stayed green (section: derive)`
- `node scripts/release-train.mjs next --self-test`: `PASS -- 6 states set-equal to 6 fixtures, 0 planted faults ..., and 8 controls stayed green (section: next)`. The attempt section has controls only: the budget transition and the counting rules have no fault to plant that the controls do not already cover.
- `node scripts/release-train.mjs render --self-test`: `PASS -- ... 2 planted faults went red naming their drift, and 3 controls stayed green (section: render)`
- `node scripts/release-train.mjs --self-test`: `PASS -- 6 states set-equal to 6 fixtures, 24 planted faults went red naming their drift, and 24 controls stayed green (section: all)`
- Dispatch fixtures: F1 (CONFLICT on chore/esr-*), F2 (BUMP_RED on chore/esr-*), F2 (BUMP_RED on renovate/*) and F3 (MAIN_RED on main) each dispatch exactly the seven keys. The dispatch plants go red naming `release.yml`, `fork`, `external-author`, `bot-actor`, `claude-fix/`, `key-not-greater`, `target-branch` and `budget`.
- Fingerprint format: `<check-label>@<40-hex base sha>`, for example `verify@11d5960a326750d5838078e36cf38b85af677262`.
- `node scripts/verify-workflows.mjs --self-test`: `PASS -- 121 planted faults went red naming the file and job, and 11 controls stayed green`. Of the 121, 4 are fixer-spend, 5 are fixer-auth and 6 are the trust-boundary fixer-tools plants (added by the security fix).
- `scripts/fixer-prepare.sh --self-test`: `PASS -- a plain edit is emitted; a planted work/.git/config, a planted hook and a .gitattributes change are each refused before any command from them runs`. Registry row `fixer-prepare-self-test`.
- `node scripts/verify-workflows.mjs`: `PASS -- 6 workflow(s), 22 uses: line(s) pinned and admitted, rules enforced: ... fixer-spend, fixer-auth, ...`
- `bash -n scripts/fixer-prepare.sh` passes. Emit mode, run in a scratch repo: the modified and new files appear in the diff and the git-ignored file does not; no mode, a relative `--out` and a bad `--tag` each exit 1 with a Next step.
- `scripts/verify-platform.sh --only workflows`, `--only workflows-self-test`, `--only zizmor` and `--only release-train-logic-self-test`: all PASS.
- `scripts/verify-platform.sh --quick`: exit 0, `verify-platform: PASS -- all checks passed`.

## Deviations from Plan

### Adaptations to the merged tree

**1. [Rule 3 - Blocking] release-train.mjs already exists (Phase 43)**
- **Found during:** pre-task read of the current tree
- **Issue:** The plan says to create the contract and says release-train.mjs does not exist yet. It is merged, reviewed, and its derive() returns a string consumed by runChecks and wouldWrite.
- **Fix:** The fixer contract is added beside the existing code. derive() keeps its return shape. fixerDispatch(facts) returns `{ dispatch, guard, route, reason }` instead of changing derive(). The plan's `derive(facts) -> { state, dispatch }` is not implemented.

**2. [Rule 2 - Missing] release-train.mjs `--self-test` sections**
- The plan asks for `derive`, `next` and `render` self-test sections. The existing bare `--self-test` is the registry row and the derive job step, so bare still runs everything, and the three named forms run their subset.

**3. [Scope] fixer-auth scoped to release-train.yml**
- The plan's rule would refuse triage.yml's `secrets.ANTHROPIC_API_KEY` reference (its environment is triage). Triage's key belongs to Phase 53. The rule is scoped to the file that carries the fixer.

**4. [Plan wording] `attempt` gates by fix runs, not by the dispatch**
- The budget guard lives in fixerDispatch (route NEEDS_OWNER) and in derive (fixAttempts fact). Nothing in this plan reads live run names; the live listing and its pagination are plan 52-04's or Phase 43's concern, as the plan's assumption q3 says.

### Deferred

**5. [Deferred] `next --self-test` has no planted faults.** The NEEDS_OWNER transition and the counting rules are proven by controls. A planted fault would be a second copy of the same check.

## Issues Encountered

- The first plant I wrote for "a fix run of another release key" tested a control as if it were a fault. The self-test went red, and I moved it to the controls. The attempt-plant list is now empty.
- An earlier `node -e` script quoted `''` inside a shell single-quoted string and corrupted `fixerInputsCli`. It was repaired with an Edit and re-run through the full self-test before commit.

## Security fix: work/.git is untrusted after the model runs (CR-01 trust boundary)

The coordinator flagged a remote-code path in the Task 3 design, which this run fixed before completing the plan:

- **The defect.** After Claude runs, `work/` is attacker-controlled, including `work/.git/config` and hooks. The first `fixer-prepare.sh` ran `git -C work diff` after the model, and the fixer's allowlist granted `Bash(git -C work diff:*)` and `Edit(work/**)`. A planted `core.fsmonitor` or `diff.external` would run inside the job that holds the federated credential. The allowlist also let the model write files through `git diff --output`.
- **The fix in `scripts/fixer-prepare.sh`.** Prep copies `work/.git` into `<state>/base.git` before the model runs, and takes the base sha from that copy. Emit runs no git inside `work/`. Its refusals come before any git call: a `work/.git` that differs from the pristine copy (a plain `diff -rq`), and a diff that touches `.gitattributes`. Every git call uses only the pristine copy, through `GIT_DIR`, a throwaway index and a copied tree, with `GIT_CONFIG_NOSYSTEM=1`, `GIT_CONFIG_GLOBAL=/dev/null`, `core.fsmonitor=false`, `core.hooksPath=/dev/null`, `core.attributesFile=/dev/null`, and `--no-ext-diff --no-textconv`. The copy excludes `.git` and `upstream/`, and ignored paths are forced in with `add -A -f` so the gate sees them.
- **Proof.** `scripts/fixer-prepare.sh --self-test` plants a `core.fsmonitor` and a `diff.external` in `work/.git/config`, a hook under `work/.git/hooks`, and a `.gitattributes` change. Each is refused, and a marker file each planted command would have created is asserted absent. A plain edit is emitted with its body, and a relative `--out` is refused. It runs in `--quick` as the `fixer-prepare-self-test` row.
- **The fixer's allowlist (`--allowedTools`).** No git grant remains. The model gets only `Bash(scripts/regenerate-patches.sh --upstream upstream --patches work/patches)` and `Bash(scripts/verify-platform.sh --quick)`, both exact with no free arguments, plus `Edit(work/**)` and `Read`. The model reads its changes directly and does not need a git command to see them.
- **The disallowed list (`--disallowedTools`).** Adds `Edit(work/.git/**)`, `Write(work/.git/**)`, `Edit(work/**/.gitattributes)` and `Write(work/**/.gitattributes)`, next to the existing patches denies.
- **The workflows row (`fixer-tools`).** Refuses any wildcard shell grant, a `git` wildcard included. Requires the `.git` and `.gitattributes` denies whenever `Edit` or `Write` is granted on `work/`. Five new plants go red naming the grant or the missing deny, plus `wildcard git grant` and `wildcard regenerate grant`. The self-test now reports 121 planted faults and 11 controls.

## Threat Flags

fixer-prepare.sh's only network use is the pinned fetch through fetch-upstream.sh. No new network surface or credential path is introduced. The `work/.git` trust boundary above is the one the plan did not anticipate, and it is now enforced.

---
*Phase: 52-claude-fixer-f*
*Completed: 2026-10-31*
