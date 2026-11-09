---
phase: 59-carry-forward-from-v1-5-and-v1-6
plan: 04
status: in-progress
plan_head_before: 576b430bb8c1d16fddf42c87b669e044019971d6
requirements-completed: []
---

# Phase 59 Plan 04: Wave-1 coordination Summary (in progress)

This file is written in stages. Task 1 created it with the Lanes record; the owner sections,
merges and closed WINDOWS ids are added by the continuation agents as each task finishes. It
is not a completed-plan summary until `status: complete`.

## Tasks

| Task | Name | Commit | Outcome |
|------|------|--------|---------|
| 1 | Tracer: dev objdir build running and three lanes live | bf24c3be | done |
| 2 | OWNER-PASS section 13, ledger amendments (CF-12) | 3c846e78 | superseded by D-14; deferred rows reopened, nothing dropped |
| 3 | OWNER-PASS section 2 remainder (47-04): postal address, download URL, website push | e79aa086 | done; every probe green, `--quick` PASS |
| 4 | OWNER-PASS section 3 remainder (CF-01) | ef9a84e5 (probes) | probes done here; owner steps moved to p59-owner (D-16); Claude follow-ups (scheduler deploy, watchdog enable, Upptime dispatch, Pages, RENEWALS rows) run after 59-OWNER-LOG.md reports the secrets set; two code reds under Gap closure (lane p59-08, D-17) |
| 5 | OWNER-PASS section 1 owner part: notifications, drill, old-repo archive (CF-02) | n/a | moved to p59-owner (D-16) |
| 6 | Merge lanes 59-01, 59-02; append the 59-02 registry rows | e0547f06, cc4c6724, 5b7ce54b, 64f13d55 | done; `--quick` 328 then 330 PASS |
| 7 | OWNER-PASS section 1 steps 9 and 14: App-list reads by device flow, 41-04 records | n/a | moved to p59-owner (D-16) |
| 8 | OWNER-PASS section 4: MAR key ceremony, release secrets, 44-01 Tasks 2-3 (CF-03) | n/a | moved to p59-owner (D-16) |
| 9 | OWNER-PASS section 5: legion runner, /etc/nixos change, Codeberg mirror (CF-04, CF-01) | n/a | moved to p59-owner (D-16) |
| 10 | Confirm the dev build, merge lane 59-03, prove the Closes rows, close WINDOWS ids | 03652d3e, 29c37e28 | done; 8 ids closed (34, 36-42); 27, 28, 43 open; `--quick` 330 PASS; 43 is gap-closure item 3 |

## Lanes

Launched 2026-11-08 from this workspace with the lane_brief command of each plan
(`--parent-worktree active` resolved to
/home/chris/orca/workspaces/Power-Browser/v1.7-Orca-integration). The full `--json` replies are
in $HOME/.cache/powerbrowser-59/lane-p59-0N.json.

| Lane | Plan | Worktree path | Branch | Orca worktree id | Agent handle |
|------|------|---------------|--------|------------------|--------------|
| p59-01 | 59-01 | /home/chris/orca/workspaces/Power-Browser/p59-01 | refs/heads/ServerDestroyer/p59-01 | 321a0514-fcf8-456c-b66d-084bc1ebb684::/home/chris/orca/workspaces/Power-Browser/p59-01 | structured-agent-session-claude_b0626a7e_91da_4565_9658_56a4ef6a0cdb |
| p59-02 | 59-02 | /home/chris/orca/workspaces/Power-Browser/p59-02 | refs/heads/ServerDestroyer/p59-02 | 321a0514-fcf8-456c-b66d-084bc1ebb684::/home/chris/orca/workspaces/Power-Browser/p59-02 | structured-agent-session-claude_6e5048f1_b804_4d7f_9f56_5a331cc41289 |
| p59-03 | 59-03 | /home/chris/orca/workspaces/Power-Browser/p59-03 | refs/heads/ServerDestroyer/p59-03 | 321a0514-fcf8-456c-b66d-084bc1ebb684::/home/chris/orca/workspaces/Power-Browser/p59-03 | structured-agent-session-claude_a7d7b680_139c_462b_866f_27b959183466 |

All three launches returned `ok: true` with a structured Claude session on the first attempt;
no `--retry-launch` was needed.

## Dev build

- `bash scripts/fetch-upstream.sh`: `fully-applied -- dirt matches the patch stack exactly`;
  `already at FIREFOX_153_5_1esr_RELEASE and accounted-for clean, nothing to do`.
- `nix develop .#theia --command node scripts/generate.mjs`: PASS, 72 files under generated/.
- Started 2026-11-08T23:59:01Z, detached with setsid/nohup:
  `nix develop .#firefox --command bash -c 'cd upstream && MOZCONFIG=../.mozconfig ./mach build'`,
  log at $HOME/.cache/powerbrowser-59/dev-build.log. This worktree had no objdir before the
  build, so no clobber was needed.
- From here until the build finishes, this session runs no apply-patches.sh, no
  regenerate-patches.sh without `--check`, no fetch-upstream.sh and no second mach build (D-05).
- Ended 2026-11-08 at 71:48 elapsed (wall 4307 s): the last binaries are
  `objdir/dist/bin/powerbrowser` (17:03:55 -0800) and `libxul.so` (17:07:11 -0800); no
  `mach build` process remains. The log has no error line and no `make: *** Error`, and it ends
  with mach's closing resource summary, but it does not carry mach's "Your build was successful"
  line. Task 10's precondition names that line, so Task 10 confirms the build first (for example
  with an incremental `./mach build` no-op) before it relies on the objdir.

## Merges

| Order | Lane | Merge commit | Lane head | Brand scan | `--quick` |
|-------|------|--------------|-----------|------------|-----------|
| 1 | 59-01 (docs only) | e0547f06 | d495291b | PASS, 678 files | PASS, 328 rows, 0 FAIL, 0 SKIP (log $HOME/.cache/powerbrowser-59/quick-t6-m01.log) |
| 2 | 59-02 (CF-15) | cc4c6724 | 20203e6e | PASS, 680 files (new files tracked by the merge) | PASS, 330 rows after the registry append (log quick-t6-m02.log) |
| 3 | 59-03 (WINDOWS 27-43) | 03652d3e | 352eb0ab | PASS, 680 files | PASS, 330 rows (log quick-t10.log), after the incremental mach build and `yarn build` |

- Both merges were clean (`git merge --no-ff refs/heads/ServerDestroyer/p59-0N`, no conflict).
- Registry append 5b7ce54b: the four comment lines and two rows from the 59-02 SUMMARY, verbatim, directly after
  `crash-autosubmit-lock-self-test` (`"crash-autosubmit-env|` at scripts/verify-platform.sh:3808).
- After the 59-02 merge: `verify-ng-040-internals-catalogue-lines.mjs` PASS without `--fix`;
  `--only crash-autosubmit-env`, `--only crash-autosubmit-env-self-test`, `--only repo-controls-self-test`,
  `--only internals-catalogue` all PASS.
- Stale items named by the 59-02 merge note reconciled in 64f13d55: 57-08-PLAN.md `status: complete`; OWNER-PASS.md
  §3e, §5.3 and the two 57-08 "waits for the other session" lines now point at `systemd/legion-pb.nix` and the 59-02
  commits. Neither lane SUMMARY names a stub row. generate.mjs was not re-run (no merged commit touched
  configuration.toml or brand/).

## Task 10: build confirmed, 59-03 merged, Closes rows proven

**Build.** The incremental `nix develop .#firefox --command bash -c 'cd upstream && MOZCONFIG=../.mozconfig ./mach build'`
after the 59-01/59-02/59-03 merges exited 0 in 19 s with `0 compiler warnings` and no error line (log
$HOME/.cache/powerbrowser-59/dev-build-noop.log). mach prints "AI agent detected. Terminal output limited to warnings
and errors." (upstream/python/mozbuild/mozbuild/build_commands.py:199), so its INFO-level "Your build was
successful!" (controller/building.py:1779) never reaches the log; that is why the first build's log lacked it too.
Exit 0 is the evidence. The packaged `PowerBrowserAPI.sys.mjs` is a symlink to the merged source (contains the 59-02
`clearEnv`). Stamps written: objdir/.pb-050-build.sha256 (ebae8968...) and objdir/.pb-060-build.sha256 (3c637bd1...).
Theia `yarn build` after the merge: exit 0, browser and node 0 errors; the compiled chrome-bar lib and the frontend
bundle post-date the merged sources.

**Proofs** (each `scripts/verify-platform.sh --only ROW` on the merged tree with this objdir; logs in
$HOME/.cache/powerbrowser-59/t10/):

| id | row | runs before close | close | post-close run | ROADMAP tick |
|----|-----|-------------------|-------|----------------|--------------|
| 34 | verify-customize-inert | PASS 1/1 (16 s) | fixed | PASS | 999.31, dde3d2c6 |
| 36 | start-failure-shows-error | PASS 1/1 (real launch; painted the classified settings-folder error) | fixed | PASS | 999.31, dde3d2c6 |
| 37 | pan04-undo-close-group-live | PASS 1/1 (82 s) | fixed | PASS on a clean tree (see note) | 999.31, 6c13d3a9 |
| 38 | ng-023-suggestions-history-bookmarks | PASS 1/1 | fixed | PASS | 999.31, 17d36026 |
| 39 | prompts-live-self-test | PASS 3/3 (about 12 min each) | fixed | PASS | 999.30, 863edd46 |
| 40 | site-identity-live + site-identity-live-self-test | PASS 1/1 each | fixed | PASS both | 999.31, 266a8243 |
| 41 | first-boot-surface-fresh | PASS 1/1 | fixed | PASS | 999.31, 8a3b6e76 |
| 42 | ng067-frontend-errors-reach-telemetry | PASS 3/3 | fixed | PASS | 999.30, 4773189f |
| 43 | page-furniture-live-self-test | PASS, **FAIL**, PASS | stays open | n/a | not ticked |
| 28 | page-tools-live | PASS 3/3 (about 238 s each) | stays open (not reproduced, no fix; backlog 999.29 stays) | n/a | not ticked |
| 27 | nav-keys-live headed real-input | not run here | stays open until 59-06's headed proof | n/a | not ticked |

- Note on 37: its first post-close run refused in 0 s with `uncommitted changes ... M .planning/ROADMAP.md,
  M .planning/WINDOWS.md` (scripts/lib/ng-a-live.mjs assertCleanTree): this session's own uncommitted close edits, not
  a product red. After commit 29c37e28 the re-run on a clean tree passed.
- Closed with `gsd-tools windows fixed ID --ws orca`; WINDOWS.md open_count 22 -> 14. Commit 29c37e28 carries
  WINDOWS.md and the eight ROADMAP ticks.
- `GATE_KNOWN_OPEN_EXCLUSIONS` rows that no longer exclude (their id is fixed, so `--gate` treats a red on them as a
  real failure, by design): verify-customize-inert (34), start-failure-shows-error (36), pan04-undo-close-group-live
  (37), ng-023-suggestions-history-bookmarks (38), prompts-live-self-test (39), site-identity-live and
  site-identity-live-self-test (40), first-boot-surface-fresh (41), ng067-frontend-errors-reach-telemetry (42). The
  list itself was not edited (no task says to); those entries are now inert text for 59-07 to prune.
- Task 10 `<verify>` chain: `--quick` (330 PASS) and `--only start-failure-shows-error`, `verify-customize-inert`,
  `first-boot-surface-fresh`: exit 0 (log t10/verify.log).

## Owner items for p59-owner (D-16)

- **Ledger re-lock (owner-only command).** Lane 59-03 changed two ledger-locked test files:
  scripts/verify-ng-023-suggestions-places.mjs (WINDOWS 38, fix 17d36026) and scripts/verify-ng-067-frontend-errors.mjs
  (WINDOWS 42, fix 4773189f). Both are merged and proven green here. Chris re-locks them with the ledger amend tool's
  `lock-checks` subcommand after reviewing the two diffs; Claude did not run it.
- **59-04 Task 4 (section 3 remainder):** R2 write token secret, `CLOCK_PRIVATE_KEY`, Upptime `GH_PAT`, then Claude's
  follow-ups (scheduler `wrangler deploy`, Watchdog enable, Upptime dispatch, Pages, RENEWALS rows) once
  59-OWNER-LOG.md reports the secrets set.
- **59-04 Task 5 (section 1 owner part):** notifications, the drill, the old-repository archive.
- **59-04 Task 7 (section 1 steps 9 and 14):** device-flow tokens per docs/RELEASING.md "App installation read-back"
  (`REPO_CONTROLS_TOKEN_<SLUG>`), live `repo-controls`, the 41-04 records; third-party lists by token or D-09 re-date.
- **59-04 Task 8 (section 4):** MAR key ceremony and release secrets, then 44-01 Tasks 2-3.
- **59-04 Task 9 (section 5):** install `systemd/legion-pb.nix` by its header steps 1-5, including the
  `services.github-runners.powerbrowser-release.url` line in configuration.nix and the 53 BLOCKED.md item 2 step 2
  root commands before the rebuild; runner online; first Codeberg mirror push.

## Task 3: OWNER-PASS §2 remainder (47-04)

- Postal address: present in website-staging/privacy.html:87; no placeholder left.
- `POWERBROWSER_DOWNLOAD_URL` = `https://powerbrowser.org/download` in
  theia/extensions/branding/src/browser/powerbrowser-update-copy.ts:50 (commit e79aa086). The
  value is a hand-written literal, not generated from configuration.toml, so generate.mjs was not
  re-run.
- Theia build: the `yarn build` run at 16:17-16:37 (log
  $HOME/.cache/powerbrowser-59/theia-build-t3.log, `Done in 1226.52s`, 0 errors for browser and
  node) already compiled the edited source: the compiled
  `extensions/branding/lib/browser/powerbrowser-update-copy.js` (16:20) and
  `applications/browser/lib/frontend/bundle.js` (16:35) both contain `powerbrowser.org/download`.
  No second build was needed.
- Website push: a62fe0d3 in Deocracy/powerbrowser-website, live.
- Live probes (2026-11-08): `/`, `/download`, `/privacy`, `/legal` on https://powerbrowser.org
  are 200 and byte-equal to website-staging/; the eleven-segment update GET is 200 and byte-equal
  to `default/Linux_x86_64-gcc3/update.xml`; an unknown BUILD_TARGET is 404.
- Task `<verify>` re-run after the build: `--only update-copy`, `--only
  updates-repo-static-self-test`, `--only updates-repo-static` all PASS, and
  `curl -fsS https://powerbrowser.org/privacy | cmp -s - website-staging/privacy.html` equal;
  chain exit 0.
- `scripts/verify-platform.sh --quick`: `verify-platform: PASS -- all checks passed`, 328 rows
  PASS, 0 FAIL, 0 SKIP (log $HOME/.cache/powerbrowser-59/quick-t3b.log; brand scan over 678 files
  PASS). About 36 minutes, because the three lanes ran their own `--quick` at the same time.

## Open values

- **Cloudflare plan (D-15, 2026-11-08):** free tiers only; no paid plan is ever bought. The
  OWNER-PASS §3a "Workers Paid only above 10 ms" clause is closed as never; a JWT-mint p95 above
  the Free CPU limit is a code red under D-03.
- **Payment method on file when R2 was enabled:** UNKNOWN to the owner (recorded neither yes nor
  no). Follow-up: Chris checks the Cloudflare billing page.
- **Email Routing destination:** christopher@deocracy.org stands (live).

## Task 2: OWNER-PASS §13

Superseded by CONTEXT.md **D-14** (Chris's ruling at the Task 2 checkpoint, committed in
3c846e78): every deferred row is un-deferred in v1.7. The eight deferred-approved rows were
reopened to `open`; none was dropped, so the six section 13 drop commands were not run and
there is nothing left to run for this section. R15 and CF-12 are withdrawn.

- NG-078, NG-079, NG-080: reopened on phase 59, closed by plan 59-05.
- NG-089: reopened on its own phase, closed by plan 59-06.
- NG-075, NG-076, NG-077, NG-081: reopened, stay on phase 999.2.

The ledger files changed by the reopen are in commit 3c846e78; this session made no ledger
change.

## Task 4: OWNER-PASS §3 remainder (CF-01), probes before the owner steps

Read-only probes run 2026-11-08 before the checkpoint (no owner step done yet):

- Release environment of Deocracy/powerbrowser: secret `BOT_APP_PRIVATE_KEY` only;
  `R2_MAR_WRITE_TOKEN` absent. Variables `R2_MAR_BUCKET` and `CLOUDFLARE_ACCOUNT_ID` present
  (2026-11-07).
- Deocracy/powerbrowser-status: no repository secret (`GH_PAT` absent); GitHub Pages not
  enabled (pages API 404); https://status.powerbrowser.org/ answers with the `*.github.io`
  certificate, so the CNAME resolves but Pages serves nothing. Uptime CI runs every few minutes
  and succeeds; `UPPTIME_STATUS_REPO=Deocracy/powerbrowser-status --only upptime-sweep-live`
  PASS (8 workflows active, ran within 36 h).
- Deocracy/powerbrowser-updates: workflow Watchdog `disabled_manually`.
- Deocracy/powerbrowser-scheduler: no secret; checkout at $HOME/.cache/powerbrowser-59/scheduler
  (5ca455b, wrangler.toml cron `17 * * * *`, `[[send_email]]` MAIL, `CLOCK_APP_ID` 5633729,
  `REPO_OWNER` Deocracy). Not deployed: the account lists only the Workers
  `powerbrowser-crash-submit` and `powerbrowser-events`.
- Token file ~/.config/cloudflare/pb-token (read from the file, never echoed): verify `active`,
  expires 2026-12-07; it reads the account's Workers scripts and subdomain, so Claude can run the
  scheduler `wrangler deploy` after Chris has set `CLOCK_PRIVATE_KEY`. Everything stays on the
  Free plan (D-15): one cron trigger, Email Routing.
- `--only events-worker` PASS, `--only watchdog` PASS (static rows).
- release-train.yml: every push run since at least 2026-11-07 (main and the v1.7 branch) failed
  in 0 s with "This run likely failed because of a workflow file issue". actionlint 1.7.12:
  `.github/workflows/release-train.yml:1968:21: context "runner" is not allowed here` (job-level
  `env: FIX_DIFF: ${{ runner.temp }}/fix-diff/work.diff` in the `fix-pr` job). GitHub rejects the
  whole file, so the §3a dry-run dispatch cannot run until a fixed workflow is on GitHub `main`.
  Code red, listed under Gap closure.
- tel06-error-delivery-live on a clean tree (0 tracked changes, the condition entry 33 asked
  for): the dirty-tree refusal is gone, but the drill now fails:
  `the drill did not complete (waitFor timed out after 10000ms waiting for truthy:
  window.__pbDrill.levelSet === true)` and `no capture at all`. Both frontend builds of the drill
  finished with 0 errors and the tree was restored to 0 tracked changes (log
  $HOME/.cache/powerbrowser-59/tel06-t4.log). WINDOWS.md 33 stays open; `windows fixed 33` was not
  run. Code red, listed under Gap closure.

## Gap closure

Code reds found in this plan, each for a gap-closure plan appended to Phase 59 (D-03):

1. **release-train.yml is invalid on GitHub.** `fix-pr` job `env:` uses `runner.temp`, which is
   not available at job level. scripts/verify-workflows.mjs:800 asserts that exact form, and its
   fixture (lines 1373, 1629) plants it, so the static gate stays green over a workflow GitHub
   refuses. The fix moves `FIX_DIFF` to a context allowed at job level (or sets it per step),
   updates verify-workflows.mjs and its self-test, and adds a check that would have gone red here.
   It must land before the D-12 push, because §3a's `release-train.yml` dry run and the scheduler
   clock both dispatch this workflow on `main`.
2. **tel06-error-delivery-live times out on `window.__pbDrill.levelSet`** on a clean tree with
   this objdir: the sidecar sends no request to the loopback endpoint. Entry 33's recorded cause
   (dirty tree) is no longer the cause.

3. **page-furniture-live-self-test (WINDOWS 43) red 1 of 3 on the merged tree.** Run 2 of 3 (2026-11-09, log
   $HOME/.cache/powerbrowser-59/t10/43-page-furniture-live-self-test-2.log): plant `copy-image-html-only` "stayed green
   on menu-edit or went red for another reason; got: Undo did not restore the second field's previous value". This is
   a different symptom from the entry's recorded one (clean-control Copy Image Link clipboard read-back): the menu-edit
   Undo leg can fail before the plant's own failure is reached. 59-03's fix 457680cf covers the clipboard read only.
   Entry 43 stays open; a gap-closure plan isolates the Undo leg and re-proves the row three of three.
4. **page-tools-live (WINDOWS 28):** green 3 of 3 here and 5 of 5 in the lane; not reproduced. Not a code red now;
   entry 28 and backlog 999.29 stay open per the 59-03 Remaining table (full-registry runs with the push log written
   out on failure).

## Deviations from Plan

- **Task 1 verify probe adjusted (not a failure).** `pgrep -f 'mach build'` also matches the
  shell that runs the probe, because its own command text contains that string, so it can
  never go red. The build was proven instead with `pgrep -af 'python.*mach build'` (pid of
  `python3 ./mach build` present) and a log that grows.
- **Orca CLI path.** Bare `orca` on this host is the GNOME screen reader outside an Orca
  terminal, so each lane command ran as `"$ORCA_CLI_COMMAND" worktree create ...` with the
  arguments otherwise verbatim.
- **Task 10 precondition "build log ending in mach's success line" read as exit 0 (not a failure).** This mach
  limits terminal output to warnings and errors when it detects an agent (build_commands.py:199), so the INFO-level
  success line is never logged. The incremental build's exit 0 with no error line, and the packaged shell file
  matching the merged source, were used instead.
- **[Rule 3 - Blocking] A post-close re-run refused on this session's own dirty tree.** The live harness's
  clean-tree guard refused the 37 re-run while the WINDOWS.md and ROADMAP.md close edits were uncommitted. The close
  was committed first (29c37e28), then 37 re-ran green. Later close batches should commit before re-running.
- **Stale items outside the lanes reconciled (64f13d55)** at the 59-02 merge note's request: 57-08-PLAN.md status and
  four OWNER-PASS.md lines.

## Gap closure merges

### 59-08 (Gap closure items 1 and 2; WINDOWS 33)

- **Lane commits:** 03b5f9b3 (release-train.yml FIX_DIFF set per step in fix-pr; verify-workflows rule
  `job-env-context`), 4fb2771e (tel06 drill arms the telemetry level at User scope), 93af17ee (tel06 drill throws its
  uncaught error from bundle code), d8f80029 (59-08 plan and summary).
- **Merge:** d0b78303, `git merge --no-ff refs/heads/ServerDestroyer/p59-08`, no conflicts. scan-brand-residue PASS
  (680 files).
- **Rows proven on the merged tree (2026-11-09):**
  - actionlint `-shellcheck=` .github/workflows/release-train.yml: exit 0.
  - `workflows` PASS, `workflows-self-test` PASS.
  - `nix develop .#theia --command bash -c 'cd theia && yarn build'`: exit 0.
  - `tel06-error-delivery-live` PASS on a clean tree ("1 positive POST(s) carried both corrected events, zero requests
    at level off, and the marker is absent from the restored bundle"), run under `flock pb-live.lock` with
    `PB_FIREFOX_BIN` this worktree's objdir and `PB_BACKEND_MAIN` this worktree's backend; tracked tree clean after.
  - `tel06-error-delivery-live-self-test` PASS.
  - `--quick` PASS (all checks).
- **WINDOWS 33:** closed with `gsd-tools windows fixed 33 --ws orca` (open_count 14 -> 13); backlog follow-up ticked in
  ROADMAP 999.32. Commit ae543f91. Gap closure items 1 and 2 above are closed by this merge.
- **Gate exclusion left in place:** the `--gate` known-open row `tel06-error-delivery-live|33|...` in
  scripts/verify-platform.sh still exists, as do the rows for 34 and 36-42 closed at 29c37e28. They are inert for a
  green check, and a red check keyed to a closed id fails the gate as "exclusion no longer applies". Removing the rows
  keyed to fixed ids is one sweep for a later change.
- **Before the D-12 push:** the release-train.yml fix (03b5f9b3) must be on GitHub `main` before §3a's
  release-train.yml dry run or the scheduler clock dispatches the workflow; GitHub rejects the pre-fix file.
