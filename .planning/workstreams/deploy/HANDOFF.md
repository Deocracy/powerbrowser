# Deploy workstream handoff (2026-10-31)

Paused by the owner so another agent can take over `/gsd-autonomous --ws deploy`.
Branch `workspace/deploy`, worktree `/home/chris/gsd-workspaces/deploy/Power-Browser`.
Nothing is running. Nothing was pushed. HEAD at pause: see `git log -1` (handoff commit).

## Read this first

- `STATE.md` in this directory was stale (phase 41, 2026-10-22) and was rewritten on 2026-10-31
  from the per-plan SUMMARY files; the per-plan SUMMARY files remain the source of truth.
- `gsd-tools query init.manager --ws=deploy` reports every phase incomplete. That is because
  owner checkpoint plans are unfinished in almost every phase, not because work is missing.
- Every phase 40-58 is planned. Most plans are built through `dsh/phase-NN` branches and merged.

## What this session did

| Plan | State | Commits |
|------|-------|---------|
| 44-02 UPD-14 descriptor builder | built, Sonnet-reviewed (0 BL, 6 WR, 3 IN), all WR fixed | 32db3520..07524bdf, review d96645b4, fixes 5a2debcc..bc9d8e03 |
| 44-03 UPD-26 descriptor monotonicity | built, Sonnet-reviewed (1 BL, 5 WR, 4 IN), all fixed | 233cc0a0..42f290d1, review 433d3ebe, fixes 3cf50e81..5bcedde1 |

44-02 and 44-03 declare `depends_on: [44-01]`, but neither needs the 44-01 key material; the
dependency is wave order only. They were run ahead of 44-01 on that basis.

Last `--quick` result: PASS on e5e997fd (reported by the 44-03 fixer). Not re-run after the
two doc-only commits that followed.

## Update 2026-10-31 (second session): 49-04 is done

| Plan | State | Commits |
|------|-------|---------|
| 49-04 descriptor job + channel-live | built, Opus-reviewed (3 CR, 5 WR, 4 IN), 10 of 12 fixed | c953d2f5..c7cff5d4, review f8b8f19b, fixes af31517e..4de8a340 |

Not fixed: CR-02 (release-manifest.json is not a Release asset; its `host` field names the build
machine, so publishing it is the owner's call — BLOCKED.md "49-04" item 2; settled 2026-10-31 by the
autonomous run: publish it, a sibling run implements it) and IN-03 (manifest-vs-tree
check duplicated across release.yml and verify-channel-live.mjs). The CR-03 retention gap is resolved
(7-day `release-linux-manifest` artifact; release-shape derives the minimum from the descriptor wait).

Last `--quick`: PASS on 4de8a340. Self-tests: channel-live 25 ok, update-download-host 11 ok.

Owner rule recorded 2026-10-31: DSH is not used for Power Browser work; Claude executes.

## Update 2026-10-31 (third pass): every automatic task is done

The owner instructed the run to settle any item not needing owner input and to keep working until
every automatic part was complete. Seventeen work items ran in parallel worktrees
(`deploy-w1-*`, `deploy-w2-*`, `deploy-w3-*`, all merged and removed) and are on `workspace/deploy`.
Final `--quick` on the merged head: `verify-platform: PASS -- all checks passed` (146 rows).
90 commits since aa11e1ee. Nothing pushed.

| Item | Result |
|------|--------|
| 49-04 CR-02 + IN-03 | manifest is a Release asset; one `--manifest-agrees` mode replaces the shell copies |
| 49-05 Tasks 1-2 | toolchain-container row; `r2_copy` write-once MAR copy (wrangler lockfile, bucket-scoped token) |
| 54-04 Tasks 1-2 | unsigned-first copy, Windows descriptors, sign-windows job with tree-derived PE allowlist; attestation of legion bytes removed |
| 55-03 Tasks 1, 3 | macOS payload gate, lipo universal step, macOS update copy |
| 55-04 Task 1 | matrix-record and download-copy gates (live row red until the Mac session) |
| 57 B1 + 57-01 Task 1 | patch-surface allowlist for the two consent files; patch 050 fails the crash-ping consent closed |
| 44-04 | ceremony and rotation docs; six fill-in lines after 44-01 (see 44-04-SUMMARY.md) |
| 42-04, 43-05, 48-05, 50-03 T2, 53-04, 56-05, 58-03 Task 1 | pre-checkpoint proofs, owner command packs, new rows |
| repo slug | derived from configuration.toml everywhere; `repo-slug-derived` quick row |
| nix default shell | `devShells.default` = theia shell; `nix-default-shell` row |
| planning | six settlements recorded; STATE.md rewritten; WINDOWS.md re-rendered |

Settlements (by the run under that instruction, not by the owner): org = Deocracy; 43 train wake =
clock-only (B); 50 dispatch token = `GITHUB_TOKEN` as recorded; 44-03 WR-03 exemption stays;
57 B1 = option (a); manifest published as a Release asset. Model tiering from this date: Opus for
security-sensitive code and reviews, Sonnet for ordinary plan execution, Haiku for bookkeeping.

Owner ruling 2026-11-01: a failed Windows sign never blocks the Linux release; Linux ships alone. Owner answer
A2 (2026-11-04) replaced "Windows joins the Release": Windows publishes to the MAR origin after the Linux publish
(plan 54-11), and the Release stays Linux-only. The tree already behaved this way (sign-publish needs only
build-linux); the `win-sign-chain` row now reds any Linux-publish-path job that waits on sign-windows.

## Next autonomous step

Superseded 2026-11-03: `FINISH-PLAN.md` in this directory is the authoritative plan (owner rulings R1-R17,
section 2 defaults, Stages A-H). The earlier "None, nothing automatic remains" no longer holds: Stage D wrote
and executed the gap plans listed there. Stages A-D are done. The next step is Stage E, the owner live pass,
with the exact commands in `OWNER-PASS.md`. Then Stage F (builds and `--gate`), Stage G (verify, audit,
`/gsd-complete-milestone v1.6 --ws deploy`) and Stage H (tag, owner-approved push). Every GSD command carries
`--ws deploy`. Evidence for each step is in `FINISH-SURVEY.md`.

Still Claude-side: plan 57-08 (clear `MOZ_CRASHREPORTER_AUTO_SUBMIT`) waits for the other session to commit
`powerbrowser/shell/PowerBrowserAPI.sys.mjs`; gap plan 54-11 (Windows publish path) is built (owner answer
A2, `phases/54-windows-h/54-11-SUMMARY.md`); the `/etc/nixos` blocks for the Codeberg timer and the
Safe Browsing key directory (tmpfiles rule) are not written yet.

## Owner answers 2026-11-04 (settled)

A1 legal name "Deocracy Institute" (`vendor_machine` stays "Deocracy"); A2 Windows publishes to the MAR origin after the Linux
publish (plan 54-11); A3 `probe-1` published as built, never `latest`, never deleted; A4 Renovate Theia licensing moves to a
release-train job (`postUpgradeTasks` dropped); A5 crash auto-submit via boundary `clearEnv` (plan 57-08, still a Claude item
waiting on the other session's commit of `PowerBrowserAPI.sys.mjs`); A6 Windows registry residue kept and recorded as known
identifiers for LEG-01; A7 installer artwork deferred to v1.7, v1.6 uses the labelled stand-ins; A8 one orphan `node.exe` until
reboot and the hash-pinned `vs.tar.zst` toolchain accepted; A9 "501(c)(3)-owned" holds. Still open for the owner: fixer pin
confirm, libvirt in one `/etc/nixos` pass, drill account, MAR primary copies, and the FINISH-PLAN.md section 3 values.

## Blocked on the owner

- **44-01:** offline secondary MAR key ceremony (SEC-05); then fill the six lines 44-04-SUMMARY.md names.
- **55-03 Task 2:** out of scope (owner ruling 2026-11-01): no Apple Team ID, Developer ID or notarization; macOS ships ad-hoc signed.
- **49-02 Task 3, 49-05 Task 3:** legion runner registration; R2 bucket, custom domain, `R2_MAR_BUCKET`,
  `CLOUDFLARE_ACCOUNT_ID`, `R2_MAR_WRITE_TOKEN` in the `release` environment.
- **Descriptor environment:** `BOT_APP_CLIENT_ID` / `BOT_APP_PRIVATE_KEY`; bot App Actions-read grant.
- **54-04 Task 3:** legion libvirt VM and the Windows asset-table row. Azure Trusted Signing is out of scope (owner ruling 2026-11-01: no official Microsoft or Apple publishing).
- **57-01 Task 2, 57-04:** tier-3 reporter-enabled build and the TEL-13 flip, after Windows ships.
- **Checkpoint tasks still owner-only:** 41-04 T1/T2/T4, 42-04 T2, 43-05 T2, 47-04, 48-05 T2, 49-05 T3,
  50-03 T1/T3, 50-04, 52-05, 53-04 T2, 54-04 T3, 55-04 T2, 56-05 T2, 57-04, 58-03 T2/T3.
  Their post-checkpoint record tasks (41-04 T3, 42-04 T3, 48-05 T3, 53-04 T3) run once the owner replies.
- Each phase's BLOCKED.md and each `*-SUMMARY.md` written today lists the exact owner steps.

## Open questions for the owner

1. **Release organisation.** Plans and research name `DeBIOS-Foundation/powerbrowser`;
   `configuration.toml` and the 2026-10-29 ruling name `Deocracy/powerbrowser`. Code follows
   `configuration.toml`. Confirm.
   **Closed 2026-10-31: the live organisation is `Deocracy`.** Settled by the autonomous run on
   2026-10-31 under the owner's instruction to decide items not needing owner input:
   `configuration.toml [urls] release_notes` names `Deocracy`, and that organisation carries the
   newer pushes. `DeBIOS-Foundation/...` as a live target in plans, research and BLOCKED.md files
   is superseded. Scripts are not edited by this record; a sibling run derives the organisation in code.
2. **44-03 WR-03 ordering.** A descriptor whose own Release is already published is exempt from the
   strict-order rule. If descriptors must always be committed while the Release is a draft, the
   exemption should become a FAIL. See `phases/44-trust-path-b/44-03-REVIEW-FIX.md`.
   **Closed 2026-10-31: the exemption stays.** Settled by the autonomous run on 2026-10-31 under the
   owner's instruction to decide items not needing owner input: `release.yml` publishes the Release in
   `sign-publish` before the `descriptor` job runs, so a strict rule could never pass.

## Known issues found on the way

- `.planning/WINDOWS.md` is out of sync with its fenced JSON (rows 10, 11, 19, 22, 23), so
  `gsd_run windows append` refuses. The unrun full-tier rows from 44-02/44-03 are not recorded there.
  Regenerate the file, then append. **Fixed 2026-10-31 (7c6d311a):** the table was re-rendered from the
  JSON and the 44-02 `build-update-xml` row appended as entry 24. 44-03's two named gaps (manifest
  `build_id`/`build_target`, wrapper `GH_CONFIG_DIR`) were already fixed in the tree, so they were not appended.
- `fixer-isolate-self-test` flaked once in `--quick` (socket mount race in `scripts/fixer-isolate.sh`),
  then passed. Pre-existing.
- `descriptor-monotonic` prints SKIP with zero candidates, but the driver summary shows PASS because
  its verdict is the exit code.
- RESOLVED in 67e2abe6: the default `nix develop` / direnv shell failed because the flake had no
  `devShells.default`, so nix fell back to `packages.default`, whose Release tarball fetch 404s before
  a Release exists. `devShells.default` is now the theia shell; the `nix-default-shell` quick row and
  its self-test guard it.
- The untracked `.planning/workstreams/deploy/config.json` and `.planning/research/.cache/*` were
  present at session start and were left untouched.

## Repo rules the next agent must keep

Commit with explicit paths only; never `-a`, `--amend`, `stash`, `git add -A` or `git add -N .`.
Stage new files before trusting the brand-residue scan. No pushes and no network writes. Never touch
`ledger/`, `scripts/verify-ng-NNN-*.mjs`, `upstream/`, or hand-edit `patches/`.
