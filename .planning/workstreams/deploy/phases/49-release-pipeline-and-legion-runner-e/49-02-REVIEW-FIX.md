---
phase: 49-release-pipeline-and-legion-runner-e
plan: 49-02
review: 49-02-REVIEW.md
fixed: 7
not_fixed: 0
---

# 49-02 review fixes

- WR-01 FIXED 7aa106e1 (hook: posix mode via assignment, `unset -f builtin`, `[[ ]]` only, refuses exported functions, BASH_ENV and ENV, EXIT trap defaults to non-zero; the reviewer's BASH_FUNC_[ reproduction now exits 1; interpreter recommendation `bash -p --noprofile --norc` is recorded, whether the runner allows choosing it is unverified)
- WR-02 FIXED 11068854 (live three-job drill mandatory in BLOCKED.md step 10 and the RELEASING.md "Runner acceptance drill"; the drill itself is an owner action and has not run)
- WR-03 FIXED b56ea0a7 (derived near-miss rows; loosening plants for suffix glob, prefix glob, tag, event glob, case-fold and trim go red naming the row they wrongly accept)
- WR-04 FIXED f58e3f90 (RELEASING.md and BLOCKED.md steps 4, 8, 9 aligned with the verified section: token file kept, extraEnvironment, tokenType registration, ephemeral false)
- IN-01 FIXED f58e3f90 (verified list extended with extraPackages, group, isSystemUser, users.groups, environment.etc source and mode; static user with custom workDir and rootless podman recorded as unverified)
- IN-02 FIXED cf83098d (hook refuses GITHUB_RUN_ATTEMPT other than 1; docs say a release re-run is a fresh dispatch)
- IN-03 FIXED 8020d229 (manual `sha256sum` comparison documented in RELEASING.md and the drill; no automation)

Brand inventory: Deocracy/powerbrowser count 35 -> 36 (COUNT MOVED note, in 11068854).
