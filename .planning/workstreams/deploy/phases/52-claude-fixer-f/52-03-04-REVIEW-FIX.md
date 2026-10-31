---
phase: 52-claude-fixer-f
plans: [52-03, 52-04]
fixed_at: 2026-10-31T00:00:00Z
review_path: .planning/workstreams/deploy/phases/52-claude-fixer-f/52-03-04-REVIEW.md
iteration: 1
findings_in_scope: 17
fixed: 17
skipped: 0
status: all_fixed
---

# Phase 52 plans 52-03 and 52-04: code review fix report

Scope: CR-01..CR-05, WR-01..WR-09, IN-01, IN-02, IN-04. IN-03 and IN-05 were not in scope and are not touched.
Branch dsh/phase-52. Step 0 merged workspace/deploy first (fa6805c1): release-train.yml, release-train.mjs and
verify-workflows.mjs were unioned with Phases 50 and 58 (18 states: the 14 bump-lane states including NEEDS_OWNER, and the 4 uptake
states; dispatch-release and uptake-replay gain the `reason != fix` gate; the fixer jobs keep their dry-run gates).

## Findings

- CR-01 FIXED c6a104d2. After `npm ci --ignore-scripts` the step runs the package's own `install.cjs` by name, then a `--version` smoke check that fails the job when the binary does not run or reports another version.
- CR-02 FIXED bfdd0b42, a08ccdf5, 7a1828d7. `fix` exports `diff-sha256` and `base-sha`; `fix-gate` and `fix-pr` check out exactly that base and verify the artifact digest; `fix-pr` accepts a verdict only when it names the same digest and base, and re-runs the pure gate stages on the exact bytes (`verify-fix-gate.mjs --static-only`, new). The gate's executing stages run through `scripts/fixer-isolate.sh` (no network, no_new_privs, no capability, scrubbed environment, pid namespace; the verdict is the job result). Artifact downloads name no run id or token. The two follow-ups were found by running the real gate through the wrapper: the isolation self-test row now runs inside the isolation, and the private loopback is brought up for `ng068-crash-extra-part`.
- CR-03 FIXED df52f70c. `fix-pr` checks out main at the root and the target at the gated base under `target/`; the diff is applied and committed there with no token; the App token is minted only when something was committed and is read by one step that runs `publish-bump-branch.sh` (now locating `release-train.mjs` next to itself) and `fix-open-pr.mjs` from the trusted root. The gate's scripts, `inventory/`, `.github/` and the baselines are laid over its worktree from main after the diff is applied (25ef9364).
- CR-04 FIXED 38ca1acf. New `fixerGuard` and `release-train.mjs --fix-guard`: the derive job counts earlier fix runs of this workflow in this repository (workflow path, head repository, display title, earlier run id), admits only attempt spent+1 within `FIX_BUDGET`, and runs `fixerDispatch` over the real actor, base-commit author, branch repository and latest Release. A re-run of a fixer run is refused; a dry run has its own run-name. `renderReleaseRed` (no caller) is removed with its plant and control.
- CR-05 FIXED 25ef9364. The gate worktree gets every git-ignored path from the trusted checkout (derived from `git status --ignored`, minus the Gecko build outputs `--quick` never reads) and the module folders from `theia/node_modules/.yarn-integrity`; the fix-gate job prepares the trusted tree as `verify.yml` does, including `yarn build`; with `--tag` the target's patches are replayed for every diff. Real gate on a docs-only control: all 8 stages pass (with and without `--tag`, and through the isolation wrapper); the `CLAUDE.md` plant is rejected at `[path]`.
- WR-01 FIXED 9cea4755. New `fixer-gate` rule in the workflows row, with 26 plants against the real release-train.yml (the reviewer's seven survivors, the digest and base bindings, the isolation, the single token reader, the checkout refs, the download-artifact inputs).
- WR-02 FIXED 5839e2bb. Bare `Read` replaced by `Read(work/**)`, `Read(fixer-data/**)`, `Read(upstream/**)`; `Read(//proc/**)`, `Read(~/**)`, `Read(.git/**)`, `Read(work/.git/**)` and the runner temp denied; every fix-job checkout has `persist-credentials: false`; `fixer-tools` refuses bare Read, `Read(**)`, a Read outside the three trees and a missing deny, with plants.
- WR-03 FIXED 26f633de. Branch names are plain refs matching the class grammar end to end (a chore/esr branch must name the target tag), the fingerprint is one anchored value, attempt is 1..FIX_BUDGET; one plant per shape plus controls.
- WR-04 FIXED 287efff2. Every printed field is an inline code span, paths are capped at 50, `parseDiffStat` counts only inside hunks and splits ` b/` paths where both halves agree; the self-test checks what the body contains (added lines never reach it, a hostile path leaves no active markdown, with a control that proves the probe sees it).
- WR-05 FIXED 86373f2a (with the base check in bfdd0b42). The log is the failed run of the fingerprint's check at the fingerprint's commit, read by run id; the job fails when none exists or when `work/` HEAD differs from the fingerprint sha.
- WR-06 FIXED 2c17e8cc (the permission drop itself is in df52f70c). The App token carries contents and pull-requests write only; the opener no longer creates labels; the `issues-write` rule reads App-token `permission-*` inputs (and a token step with none), with two plants.
- WR-07 FIXED 86373f2a. The fence carries a per-run random nonce, log lines containing it are dropped, the prompt names it; `fixer-gate` terms and plants check the nonce and the `--commit` selection.
- WR-08 FIXED d8762b55. Prep applies the target's patch stack to the fetched upstream/ so `regenerate-patches.sh` works (a stack that does not apply fails the prep); F1 is refused explicitly by `fixerInputsCheck` (guard `class-f1`, with a plant) and in the `class` input text. Prep's apply step needs a network fetch and was not run here.
- WR-09 FIXED f0d7c53d. RELEASING.md now separates what is live (owner dispatch, F2/F3, the guards, the bindings, the isolated gate) from the pure contract nothing runs (the tracking-issue labelling, owner assignment and log link; nothing watches release.yml).
- IN-01 FIXED d8762b55. Prep copies every `.gitattributes` as a plain file; emit compares the set and bytes before any git call (a git shim proves none runs), with changed, nested-added and removed plants and an unchanged control.
- IN-02 FIXED df52f70c. `fix-pr` exits red with an error annotation and a job summary when the publish plan refuses; when the gated diff changes nothing it ends with a warning and a job summary and opens nothing.
- IN-04 FIXED d8762b55. Prep refuses any symlink already in `work/` (plain `find`; plant and control).

## Verification

Run in this clone (`dsh/phase-52`, where `nix develop .#theia` and git-ignored build outputs exist; the isolation used its unprivileged user-namespace form):

- Real gate, docs-only control (`docs/CUSTOMIZE.md`, one added line), `nix develop .#theia --command bash scripts/fixer-isolate.sh -- node scripts/verify-fix-gate.mjs --diff=... --tag=<pin tag> --ref=<HEAD sha>`: `fix-gate: PASS -- verdict: pass ... every stage green` (stages 1-8, including `verify-platform.sh --quick` inside the isolation).
- Real gate, deny plant (`CLAUDE.md` one-line change), same command: `verdict: reject`, `[path] "CLAUDE.md" matches the deny entry 'CLAUDE.md'`, exit 1.
- Self-tests: `release-train.mjs` (18 states, 53 plants, 40 controls), `verify-fix-gate.mjs` (37 plants, 3 controls), `fix-open-pr.mjs`, `fixer-prepare.sh`, `fixer-isolate.sh`, `verify-workflows.mjs` (165 plants, 11 controls): all PASS. `publish-bump-branch.sh`: syntax check only (it has no self-test).
- `verify-platform.sh --only workflows`, `workflows-self-test`, `zizmor`, `release-train-logic-self-test`; `node scripts/generate.mjs --check`: all PASS. Full `scripts/verify-platform.sh --quick` (with this report staged): exit 0, `verify-platform: PASS -- all checks passed`; the same table also passes in full when run inside `scripts/fixer-isolate.sh`, which is how stage 8 of the real gate runs it.
- Where verification ran: the main checkout of the `dsh/phase-52` clone, not an isolated worktree of this agent; the gate's own throwaway worktree is described above.

Not proven: the `sudo -n unshare` + `setpriv` form of the isolation and the CI preparation step (generate, fetch, install, drivelist rebuild, `yarn build`) on a GitHub-hosted runner; prep's patch-stack apply (needs a fetch); the derive job's run listing and author lookup; the pinned CLI install on a runner. They are listed in BLOCKED.md item 6.

---

_Fixed: 2026-10-31_
_Fixer: Claude (gsd-code-fixer)_
_Iteration: 1_
