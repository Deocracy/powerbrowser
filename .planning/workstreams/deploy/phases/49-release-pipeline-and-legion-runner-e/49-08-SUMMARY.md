---
phase: 49-release-pipeline-and-legion-runner-e
plan: 08
gap_closure: true
status: complete
requirements: [INF-04]
commits: [5c20c269, 796c796c]
key_files:
  modified:
    - .github/workflows/release.yml
    - scripts/verify-release-shape.mjs
    - scripts/verify-platform.sh
---

# 49-08 summary: post-publish artifact deletion (G-49c, INF-04)

- New job `purge-artifacts` in release.yml: `needs: sign-publish`, `if: needs.sign-publish.result == 'success'`,
  ubuntu-latest, permissions exactly `{actions: write}`, no environment, no secret. For each name in
  `PURGE` (`release-linux`, the tarball and the complete MAR), it lists this run's artifacts, deletes each id
  with `gh api -X DELETE repos/<repo>/actions/artifacts/<id>`, then exits 1 if any is still stored.
  `release-linux-manifest` and `release-linux-identity` (7 days, read behind the descriptor wait) are kept.
- `release-shape` rule 11 `purge` derives the bulky set from the build-linux upload steps and compares it with
  `PURGE` by set equality. It refuses a descriptor-wait artifact, a wider grant, a run not gated on
  sign-publish success, and a missing remaining-count check. Six plants.
- Verification: `release-shape --self-test` (57 plants), `workflows`, `workflows-self-test`, `zizmor`,
  `win-sign-chain-self-test` green; `--quick` green except the known `fixer-isolate-self-test`.
- Not done here: the measured per-release artifact size against the 500 MB cap and the docs/BUILD.md INF-04 rows.
  Both are 49-05 Task 3, which is owner-pending. The Windows artifacts (`release-windows`,
  `release-windows-signed`) are not purged. Their consumer, the unsigned Windows publish (G-54b), does not
  exist yet, and they expire after one day.
