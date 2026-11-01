# Deploy workstream handoff (2026-10-31)

Paused by the owner so another agent can take over `/gsd-autonomous --ws deploy`.
Branch `workspace/deploy`, worktree `/home/chris/gsd-workspaces/deploy/Power-Browser`.
Nothing is running. Nothing was pushed. HEAD at pause: see `git log -1` (handoff commit).

## Read this first

- `STATE.md` in this directory is stale: it still says phase 41 (last updated 2026-10-22).
  The real position is in git (`git log --merges`) and in the per-plan SUMMARY files.
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
machine, so publishing it is the owner's call — BLOCKED.md "49-04" item 2) and IN-03 (manifest-vs-tree
check duplicated across release.yml and verify-channel-live.mjs). The CR-03 retention gap is resolved
(7-day `release-linux-manifest` artifact; release-shape derives the minimum from the descriptor wait).

Last `--quick`: PASS on 4de8a340. Self-tests: channel-live 25 ok, update-download-host 11 ok.

Owner rule recorded 2026-10-31: DSH is not used for Power Browser work; Claude executes.

## Next autonomous step

**None.** Every unfinished plan is an owner checkpoint or is blocked on an owner action (below).
Per the owner's rule, owner checks are deferred to one end-of-milestone pass. Start that pass with
the "Blocked on the owner" and "Open questions" lists, plus BLOCKED.md "49-04" item 2.

Owner instruction for this run: **every subagent runs on Opus** (given 2026-10-31, supersedes the
Haiku/Sonnet default for this run).

## Blocked on the owner

- **44-01, 44-04:** offline secondary MAR key ceremony (SEC-05). 44-04 documents it.
- **55-03:** Apple Team ID for the hook-only entitlements patch. See `phases/55-macos-i/BLOCKED.md`.
- **49-02 Task 3, 49-05:** legion runner registration and R2 origin. See `phases/49-*/BLOCKED.md`.
- Non-autonomous checkpoint plans: 41-04, 42-04, 43-05, 47-04, 48-05, 50-03, 50-04, 52-05, 53-04,
  54-04, 55-04, 56-05, 57-04, 58-03.

## Open questions for the owner

1. **Release organisation.** Plans and research name `DeBIOS-Foundation/powerbrowser`;
   `configuration.toml` and the 2026-10-29 ruling name `Deocracy/powerbrowser`. Code follows
   `configuration.toml`. Confirm.
2. **44-03 WR-03 ordering.** A descriptor whose own Release is already published is exempt from the
   strict-order rule. If descriptors must always be committed while the Release is a draft, the
   exemption should become a FAIL. See `phases/44-trust-path-b/44-03-REVIEW-FIX.md`.

## Known issues found on the way

- `.planning/WINDOWS.md` is out of sync with its fenced JSON (rows 10, 11, 19, 22, 23), so
  `gsd_run windows append` refuses. The unrun full-tier rows from 44-02/44-03 are not recorded there.
  Regenerate the file, then append.
- `fixer-isolate-self-test` flaked once in `--quick` (socket mount race in `scripts/fixer-isolate.sh`),
  then passed. Pre-existing.
- `descriptor-monotonic` prints SKIP with zero candidates, but the driver summary shows PASS because
  its verdict is the exit code.
- The default `nix develop` / direnv shell fails: it fetches a release tarball from GitHub that 404s
  because no release exists yet. `.#theia` and `.#firefox` are unaffected.
- The untracked `.planning/workstreams/deploy/config.json` and `.planning/research/.cache/*` were
  present at session start and were left untouched.

## Repo rules the next agent must keep

Commit with explicit paths only; never `-a`, `--amend`, `stash`, `git add -A` or `git add -N .`.
Stage new files before trusting the brand-residue scan. No pushes and no network writes. Never touch
`ledger/`, `scripts/verify-ng-NNN-*.mjs`, `upstream/`, or hand-edit `patches/`.
