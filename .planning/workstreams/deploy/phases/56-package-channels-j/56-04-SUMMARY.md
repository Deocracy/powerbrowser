---
phase: 56-package-channels-j
plan: 04
subsystem: release-train
status: complete
tags: [release-train, github-actions, bot-app, wingetcreate, external-data-checker, DIST-12]

requires:
  - phase: 56-package-channels-j
    provides: the flake package and hash record (56-01), the cache and Flathub static halves (56-02), the winget set and the cask (56-03)
provides:
  - .github/workflows/channel-manifests.yml, the four-leg channel stage and its dry run, behind the train's workflow_call interface
  - scripts/verify-channel-release-jobs.mjs, the channel-release-jobs row, its self-test, and the --facts, --check-key, --check-checker and --render modes the stage calls
  - docs/channel-train-mapping.md, the input table, the call contract and the A6 follow-up
affects: [56-05]

actuals:
  tokens: 17025     # chars/4 over the plan's realized diff (git diff a5375289..HEAD, 68102 bytes)
  tasks: 2
  commits: 3        # MEASURED: git rev-list --count a5375289..HEAD (the third is the phase BLOCKED renumbering)
plan_head_before: a53752891672b9b40611e2fdd4bff18f27b98458
plan_head_after: 9606026d8cddf902ea80bf6035a5529d72f17429

key-files:
  created:
    - .github/workflows/channel-manifests.yml
    - scripts/verify-channel-release-jobs.mjs
    - docs/channel-train-mapping.md
  modified:
    - scripts/lib/channel-identity.mjs
    - scripts/verify-winget-manifest.mjs
    - scripts/verify-homebrew-cask.mjs
    - scripts/verify-platform.sh

key-decisions:
  - "The flake-hash leg opens a pull request on chore/channel-<key> and never pushes to main (GH-05). The row refuses a push to main and a force push in that job."
  - "The flake hash comes from nix store prefetch-file on the published asset and is cross-checked against the train's tarball_sha256 input. The hash record is written with the release key, and verify-flake-repack.mjs --release runs before the pull request opens."
  - "The tap leg is a direct push to the tap's default branch with the bot App token. Only the tap repository is written there; the row refuses a push to main only in the flake leg."
  - "The winget leg runs on windows-latest, because wingetcreate is a Windows tool. It writes the set with wingetcreate update --out first and submits second, reads WINGET_TOKEN from the release environment by name, and is gated on the Windows asset the train names (A2)."
  - "The dry run is a separate workflow_dispatch job. It renders the four payloads into the runner temp directory and holds no secret, pushes nothing and submits nothing. Its artifacts are listed in the log only: upload-artifact is not an admitted, pinned action here."
  - "No new third-party action is used. Every action is SHA-pinned to a pin already in release-train.yml, and actions-selected.json is unchanged."
  - "All live legs gate on the derive job, which refuses a key the tree does not derive (--check-key)."
  - "The shared channel values and the two fixture digests moved to scripts/lib/channel-identity.mjs, so the winget, cask and dry-run renderers read one source."

patterns-established:
  - "A release stage is a reusable workflow whose live legs each name their environment, read secrets by name, and gate on the train's inputs; the dry run is a separate dispatch-only job that renders and never writes."

requirements-completed: [DIST-12]

coverage:
  - id: D1
    description: "four legs per release: flake-hash pull request, tap commit, gated winget submission with WINGET_TOKEN by name, checker-template check"
    requirement: "DIST-12"
    verification:
      - kind: automated
        ref: "scripts/verify-platform.sh --only channel-release-jobs (PASS); channel-release-jobs-self-test (9 red, 1 green)"
        status: pass
  - id: D2
    description: "no push to main, no schedule, no pull_request trigger, no credential literal, every action pinned and admitted"
    requirement: "DIST-12"
    verification:
      - kind: automated
        ref: "channel-release-jobs row; workflows and workflows-self-test (PASS); zizmor (PASS)"
        status: pass
  - id: D3
    description: "the dry run renders the four payloads outside the repository and submits nothing"
    requirement: "DIST-12"
    verification:
      - kind: automated
        ref: "node scripts/verify-channel-release-jobs.mjs --render <scratch> --key v153.5.1-1 (PASS, 6 files, 0 unresolved tokens); --render inside the tree refused (exit 2)"
        status: pass
---

# Phase 56 Plan 04: Channel release stage Summary

**The four per-release channel legs run as one reusable stage behind the release train, with a flake-hash pull request, a direct tap commit, a gated winget submission, and a static checker check, and a dispatch-only dry run that renders and submits nothing.**

## Performance

- **Tasks:** 2 of 2
- **Commits:** 3 (2c3de87b, dd207974, and the phase BLOCKED renumbering 9606026d)
- **Quick gate:** `scripts/verify-platform.sh --quick` exit 0 after the last commit (see the final run below).
- **Live legs:** none run. Every live submission waits on the train, the Apps, the stores and the published release (plan 56-05).

## Accomplishments

- `.github/workflows/channel-manifests.yml` has `workflow_call` (the train, four inputs) and `workflow_dispatch` (the dry run). The jobs are `derive`, `dry-run`, `flake-hash-pr`, `tap-commit`, `winget-submit` and `checker-freshness`.
- `flake-hash-pr` runs in the `bot` environment with `permissions: {}` and a job-scoped App token, the pattern `release-train.yml`'s `bump-pr` uses. It prefetches the published tarball, cross-checks the train's digest, writes `nix/pkg/release-hash.json`, runs `verify-flake-repack.mjs --release`, pushes `chore/channel-<key>`, and opens the pull request to `main`.
- `tap-commit` checks out the tap with the bot token, renders the tracked cask from `--facts` and the disk-image digest, and pushes the tap's default branch. It is gated on `dmg_sha256`.
- `winget-submit` runs on `windows-latest` in the `release` environment. It writes the set with `wingetcreate update --out`, then submits with `WINGET_TOKEN` referenced by name. It is gated on `winget_asset`.
- `checker-freshness` runs `--check-checker`, which resolves the Flatpak `x-checker-data` template for the key without network.
- `scripts/verify-channel-release-jobs.mjs` checks the file and exposes the modes the stage calls.
- `docs/channel-train-mapping.md` records the input table, the call contract, the dry run and the A6 follow-up.

## Green row runs

- `channel-release-jobs`: PASS. `channel-release-jobs-self-test`: PASS, 9 planted faults red naming the job or value, 1 control green.
- `workflows` and `workflows-self-test`: PASS, with the new workflow and no admission change.
- `zizmor`: PASS, on the new workflow.
- `renewals`: PASS.
- Dry run: `node scripts/verify-channel-release-jobs.mjs --render <scratch> --key v153.5.1-1` wrote six files (the flake-hash plan, the cask, the three winget manifests, the checker URL) with zero unresolved tokens. Rendering inside the tree was refused with exit 2.
- Mode checks: `--check-key v153.5.1-1` PASS; `--check-key v153.5.1-9` FAIL as intended; `--check-checker v153.5.1-1` PASS.
- `ruby -c` on the cask: `Syntax OK` (see BLOCKED.md item 5).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Secret-name capture took the whole match**
- **Found during:** the first row run
- **Issue:** `matchAll` destructuring took the full match, so the allowlist compared `secrets.X` instead of `X`, and every leg was red.
- **Fix:** the row reads the capture group.
- **Commit:** 2c3de87b

**2. [Rule 1 - Bug] Dead fallback in the flake leg's URL lookup**
- **Found during:** self-review before the commit
- **Fix:** the leg reads `@RELEASE_URL@` from `--facts` with jq, and the fallback is gone.
- **Commit:** 2c3de87b

**3. [Rule 1 - Bug] The checker check failed on the tree**
- **Found during:** the first run of `--check-checker`
- **Issue:** the manifest carries the template token, which the check did not render before comparing.
- **Fix:** the token renders to the derived template first.
- **Commit:** 2c3de87b

**4. [Rule 2 - Missing critical] The dry run needed a render mode**
- **Found during:** Task 2
- **Fix:** `--render <dir> --key <key>` writes the payloads outside the repository and refuses an in-tree path or a key the tree does not derive.
- **Commit:** 2c3de87b

**5. [Rule 1 - Bug] Message wording and a duplicate import**
- **Fix:** message wording corrected, unused import removed.
- **Commit:** 2c3de87b

### Plan items implemented differently

- **Dry-run artifact:** the plan asked for the four payloads to be emitted locally. They are rendered into the runner temp directory and listed in the log. `upload-artifact` is not in the admitted, pinned action set, and adding it would have needed an admission change and a SHA I could not verify offline.
- **Task 2 row extension:** the dry-run shape assertions live in the row's main check, and the self-test plants a submit step into the dry run.
- **Train mapping:** `docs/channel-train-mapping.md` describes the contract. `release-train.yml` calls only `rebase-upstream.yml` today and does not call `channel-manifests.yml`, so the A6 delta cannot be recorded until the train wires the stage (BLOCKED item 14).

## Known Stubs

| Stub | File | Why it stays |
| --- | --- | --- |
| The `winget_asset`, `dmg_sha256` and `tarball_sha256` inputs have no default value | .github/workflows/channel-manifests.yml | The train supplies them after publish. The gates skip the winget and tap legs until they are set. |
| `workflow_call` is not yet called by `release-train.yml` | .github/workflows/release-train.yml | A6: the Phase 49 table owns that wiring (BLOCKED item 14). |

## Threat Flags

| Flag | File | Description |
| --- | --- | --- |
| threat_flag: token scope | .github/workflows/channel-manifests.yml | The bot App token (contents and pull-requests write) is minted in the `bot` environment and used for the flake pull request and the tap push. The App must not hold Workflows permission. The check of the App's scope is BLOCKED item 13. |
| threat_flag: direct tap push | .github/workflows/channel-manifests.yml | The tap leg pushes the tap's default branch without a review step, as the tap repository's own rule allows. The rendered cask is the only file it writes. |

## Unverified offline

- The GitHub Actions run itself. No workflow was dispatched and no App token was minted.
- `wingetcreate` flags (`update --out`, `submit --token`) and `winget install --id Microsoft.WingetCreate`, which were checked against the research notes, not against the tool on a Windows runner (BLOCKED item 11).
- `nix hash convert --hash-algo sha256 --to sri` on the hosted runner's Nix version (the cross-check in the flake leg).

## Self-Check

- [x] Four legs, a dry run and derive present (`channel-release-jobs` PASS).
- [x] No push to main, no schedule, no pull_request trigger, no credential literal (row and self-test).
- [x] Every action pinned and admitted, no admission change needed (`workflows` PASS).
- [x] The dry run renders outside the tree with zero unresolved tokens and submits nothing.
- [x] No live action: no pull request, no tap push, no winget submission, no secret read.
- [x] `--quick` exit 0 after the last commit.

## Self-Check: PASSED
