---
phase: 49-release-pipeline-and-legion-runner-e
fixed_at: 2026-10-31T00:00:00Z
review_path: .planning/workstreams/deploy/phases/49-release-pipeline-and-legion-runner-e/49-REVIEW.md
iteration: 1
findings_in_scope: 15
fixed: 15
skipped: 0
status: all_fixed
---

# Phase 49: Code Review Fix Report

Branch dsh/phase-49. Findings that touch the same workflow hunks share one commit (release.yml and its
three rows cannot be split without leaving a row red between commits).

- BL-01: FIXED 43d4afd (signer + independent verifier), 3d39e9e (workflow wiring, step-level token, no LD_LIBRARY_PATH). The signer is built by `scripts/build-signmar.sh` from the pinned Firefox source (tag, commit and per-file sha256 in `powerbrowser/packaging/signmar/SOURCES.sha256`), on the hosted job, never from the legion artifact. Verification is `signmar -v` plus `scripts/verify-mar-signature.mjs` (node:crypto). Limit: both read the MAR byte layout from `mar_verify.c`. Requires owner confirmation (BLOCKED.md item 8; SEC-07 text still says container-built).
- BL-02: FIXED 3d39e9e (inputs.sha, SHA gate re-run on the hosted checkout, release key derived from the tree and compared with the manifest, tag and asset names from the derived key).
- WR-01: FIXED 3d39e9e (exact `{contents: read}` at workflow and job level, any `secrets` word, token/ssh-key inputs, mounts; plants for each form).
- WR-02: FIXED 3d39e9e (every step after the key gate carries the key-gate `if:`; full-SHA step, HEAD equality, workflows diff, configuration.toml test, `--no-cache`, `--pull=always` each asserted and planted).
- WR-03: FIXED 3d39e9e (shared `failOpenFaults`: no continue-on-error, `|| true`, `set +e`, stray `if:`; the `exit 1` must sit in the mismatch branch; plants for each). Structural text checks, not execution against a stub signmar (that would need jq in --quick).
- WR-04: FIXED abce108 (schema regex tightened, `marOrigin()` called from generate; REBRANDING.md corrected). The --quick plants (3 bad origins) are in 3d39e9e.
- WR-05: FIXED 3d39e9e (`concurrency: release`, no cancel; a stale draft for the tag is deleted; stale-approval re-check directly before the token mint).
- WR-06: FIXED 3d39e9e (fail-closed design: deliberate `r2_gate` failure after the draft is verified and before the bot token; header corrected; row requires `r2_gate` or `r2_copy`; BLOCKED.md item 11).
- WR-07: FIXED 3d39e9e (fetch-upstream, apply-patches and the Theia build added to build-linux, gated). Never run on legion (BLOCKED.md item 10).
- WR-08: FIXED 3d39e9e (release key anchored to `^v\d+(\.\d+)*-\d+$`, asset names to `[A-Za-z0-9._-]`, null token refused in `--expected`; also stops requiring js-yaml on the hosted runner for `--expected`/`--draft`).
- WR-09: FIXED 140ade9 (comparator + self-test), wired in 3d39e9e; exit 2 on a non-numeric tag fails the run; a "nothing to build" run writes a notice and a step summary.
- WR-10: FIXED 3d39e9e (exception recorded in the workflow header, docs/RELEASING.md and the row, which allows exactly the `PB_KEYDIR:/keys:ro` mount and the workspace).
- WR-11: FIXED 3d39e9e for the in-file guard (first step of build-linux and sign-publish, asserted and planted). The real control is still plan 49-02's runner group (BLOCKED.md item 12); the environment branch policy is already asserted by repo-controls.
- IN-01: FIXED 3d39e9e (`grep -x ... >/dev/null`, `awk 'NR==1'` instead of `head`).
- IN-04: FIXED 3d39e9e (`overwrite: true` on the artifact upload; fresh-dispatch note in docs/RELEASING.md and BLOCKED.md item 13).

Not in scope and untouched: IN-02, IN-03 (IN-03 noted in docs/RELEASING.md), ledger/, scripts/verify-ng-*.mjs.

## Verification

Run in the clone /home/chris/gsd-workspaces/deploy/dsh/phase-49 (no worktree), all green after commit 03bebf3: every changed row and self-test via `scripts/verify-platform.sh --only <label>` (release-shape, release-shape-self-test, mar-channel-gate, mar-channel-gate-self-test, release-asset-set, release-asset-set-self-test, release-key-newer-self-test, mar-signature-self-test, workflows, workflows-self-test, zizmor), `node scripts/generate.mjs --check` (56 files), and the full `scripts/verify-platform.sh --quick`. `build-signmar.sh` was compiled and exercised under Nix (NSS 3.112) with a sign, `-v` and node:crypto round trip; nothing ran on a hosted or legion runner, and no network write was made (read-only fetches of the pinned files from raw.githubusercontent.com).

---

_Fixed: 2026-10-31_
_Fixer: Claude (gsd-code-fixer)_
_Iteration: 1_
