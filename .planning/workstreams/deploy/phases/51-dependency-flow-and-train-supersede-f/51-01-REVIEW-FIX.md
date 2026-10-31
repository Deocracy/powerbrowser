# Phase 51, plan 51-01: review fix report

Source: `51-01-REVIEW.md` (9 findings: 1 blocker, 5 warnings, 3 info). Fixed in the clone
`/home/chris/gsd-workspaces/deploy/dsh/phase-51` on branch `dsh/phase-51`, one commit per finding,
explicit paths only, committed as Christopher Colantuono. Verification ran in that clone, not a worktree, at HEAD `16faefcb`.

## Findings

- BL-01 FIXED 113dcf49 (follow-up 16faefcb keeps the planning-paths row green): managerFilePatterns anchored to `^configuration\.toml$`, `ignorePaths: [".planning/**"]`, and the verifier derives the tracked `configuration.toml` copies from `git ls-files`, then refuses any manager match other than the root file and any copy `ignorePaths` does not skip. Whole-tree dry run: zero branches at the current pins.
- WR-01 FIXED dd2509d1 (the requirement stays unmet until the owner decides, BLOCKED.md item 5): the nix manager is off (Renovate's default), `flake.lock` is removed from the post-upgrade fileFilters, the `[nix]` rule and the PASS wording are corrected, and the verifier refuses `nix.enabled: true`. nixpkgs stays disabled. AUTO-02 is marked partial in the summary. REQUIREMENTS.md is not edited.
- WR-02 FIXED 9e4c1a88: `vulnerabilityAlerts: { enabled: false }` and `osvVulnerabilityAlerts: false`, with a `vulnerability-alerts` rule and four plants.
- WR-03 FIXED 8b327e72: the verifier is an allow-list. Keys are checked at the top level, in packageRules, in customManagers, in the post-upgrade hook and in vulnerabilityAlerts. Named refusals cover extends, lockFileMaintenance, dependencyDashboard, a second customManager, automerge outside the top level, and matchUpdateTypes on a Theia or monaco group. packageRule order is simulated. Each reviewer mutation has a plant.
- WR-04 FIXED fd767e05: three `licensing-inputs` plants (notices file, licensing generator, generate check). Missing inputs come from an in-memory `absent` override, so the self-test still writes nothing to disk.
- WR-05 FIXED 677d4c05 (recorded only; the requirement stays owner-gated): BLOCKED.md item 6 lists the allow-list env var, `theia/node_modules`, `python3`, the Node archive and a git checkout as dispatch-job requirements. AUTO-02 completes only after one live PR shows the `licensing` row green.
- IN-01 NOT FIXED: not in the requested fix list, and the reviewer recorded no defect (no hard-coded absolute path in the change set). No change made.
- IN-02 NOT FIXED: not in the requested fix list, and the reviewer recorded no defect (no tracked change from the yarn restore). No change made.
- IN-03 FIXED 28238ee4: the summary's no-branch result is corrected with the whole-tree dry run and a positive control, "nix enabled" is corrected, the plant count is corrected to 56, and the commit counts are annotated.

## Verification

- `node scripts/verify-renovate-config.mjs`: PASS. The line names the nix manager as off and reports 4 file filters.
- `node scripts/verify-renovate-config.mjs --self-test`: PASS. 56 planted faults each went red naming their rule. The unmodified tree and the clean fixture stayed green (58 ok lines). The reviewer's 27 emitted rules all have a plant.
- `renovate-config-validator` 44.198.3, `--no-global --strict` on `.github/renovate.json5` at HEAD: validated.
- Renovate 44.198.3, local platform, `dry-run=lookup`, on a `git archive HEAD` copy of the whole tree (1374 tracked files, 10 tracked `configuration.toml` copies) at `/tmp/claude-1000/rv51/tree-final`, HEAD `677d4c05`: `Matched 1 file(s) for manager regex`, `0 flattened updates found`, `Returning 0 branch(es)`.
- Positive control, same copy with the root `theia_release` set to 1.75.0 (scratch copy only): `Matched 1 file(s)`, `1 flattened updates found: @theia/core`, `Returning 1 branch(es)` on `chore/theia-theia`. The lookup can open a branch, and the fixtures contribute nothing.
- `scripts/verify-platform.sh --only renovate-config`, `--only renovate-config-self-test`, `--only workflows`, `--only zizmor`: all PASS.
- `scripts/verify-platform.sh --quick` at HEAD `16faefcb`: exit 0, "all checks passed". The first run went red on the planning-paths row because of the BL-01 plant; the follow-up commit fixed it and the gate passed.

## Not verified

- The post-upgrade hook has not run under Renovate. The dry run has no update to execute it against.
- The rendered branch names and the licensing row are unverified until one live PR (BLOCKED.md items 3 and 6).
- The `renovatebot/github-action` admission and the dispatch job are not applied (BLOCKED.md item 1).
