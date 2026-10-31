---
phase: 50-release-train-stages-and-first-public-linux-release-e
fixed_at: 2026-10-31T00:00:00Z
review_path: .planning/workstreams/deploy/phases/50-release-train-stages-and-first-public-linux-release-e/50-REVIEW.md
iteration: 1
findings_in_scope: 9
fixed: 7
partial: 2
skipped: 0
status: partial
---

# Phase 50: Code Review Fix Report

- CR-01 FIXED 77a14690 (release.yml `run-name: Release ${{ inputs.sha }}`, pinned by the release-shape row with plants; count, link and `releaseFactsFromLive` match display title + `workflow_dispatch` + release.yml path + this repository; fixtures carry main's tip as head_sha; new `dispatch-release` rows execute the shipped steps with main advanced and a head_sha plant goes red; RELEASING.md updated). Requires human verification: `display_title` and `path` shapes of the Actions runs API are asserted from fixtures, not from a live run.
- WR-01 FIXED 8b11feb2 (`--base main` and `isCrossRepository == false`, same jq form as workspace commit 23d53677; its plants live in the `dispatch-release` rows added by 77a14690).
- WR-02 FIXED df6b03ae (`--signer-workflow <repo>/.github/workflows/release.yml`, `--source-ref refs/heads/main`, `--deny-self-hosted-runners` in both forms; fake gh asserts the exact flags and the `--bundle` file; pin-drop plants; BUILD.md and RELEASING.md). Requires human verification: the flag set is checked against the double, not against a real `gh`.
- WR-03 FIXED d6545406 (fake signmar and certutil on PATH drive the real `verifySignature` and `marChannel`; green control plus six plants including SIGNMAR unset and a missing channel line).
- WR-04 FIXED 154b251a (failure text and header name the `mar_origin` of configuration.toml, derived at check time; self-test requires it; both allowlist reasons corrected; `generate.mjs --check` green; BLOCKED.md item 5 closed). The allowlist disposition of release-assets.githubusercontent.com is unchanged (`allow`); whether it should become `deny` is an owner decision.
- IN-01 NOT FIXED in part: `requested` and `pending` runs now derive BUILDING (77a14690). A failed or cancelled run with no Release still derives null, because a new fail-visible state changes the 13-state table and the 50-01 contract.
- IN-02 FIXED 77a14690 (`|| true` on the run-link poll lookup).
- IN-03 FIXED in part c1605790 (servedUrl must equal the manifest `[urls] update` value exactly, with a plant). NOT FIXED: tying the asset segment of `servedMarUrl` to a known asset name.
- IN-04 FIXED 77a14690 (correction section in 50-01-SUMMARY.md).

Verification (main checkout of this clone, not a worktree): `release-train.mjs --self-test`, `verify-release-sha-gate.mjs` and `--self-test`, `verify-mar-update-hop.mjs --self-test`, `verify-update-download-host.mjs` and `--self-test`, `verify-dispatch-release.mjs --self-test`, rows `workflows`, `workflows-self-test`, `zizmor`, `release-shape`, `release-shape-self-test`, `generate.mjs --check`, and `scripts/verify-platform.sh --quick` all exit 0.

_Fixer: Claude (gsd-code-fixer)_
