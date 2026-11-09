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
| 6 | Merge lanes 59-01, 59-02; append the 59-02 registry rows | (pending) | |
| 7 | OWNER-PASS section 1 steps 9 and 14: App-list reads by device flow, 41-04 records | n/a | moved to p59-owner (D-16) |
| 8 | OWNER-PASS section 4: MAR key ceremony, release secrets, 44-01 Tasks 2-3 (CF-03) | n/a | moved to p59-owner (D-16) |
| 9 | OWNER-PASS section 5: legion runner, /etc/nixos change, Codeberg mirror (CF-04, CF-01) | n/a | moved to p59-owner (D-16) |
| 10 | Confirm the dev build, merge lane 59-03, prove the Closes rows, close WINDOWS ids | (pending) | |

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

## Deviations from Plan

- **Task 1 verify probe adjusted (not a failure).** `pgrep -f 'mach build'` also matches the
  shell that runs the probe, because its own command text contains that string, so it can
  never go red. The build was proven instead with `pgrep -af 'python.*mach build'` (pid of
  `python3 ./mach build` present) and a log that grows.
- **Orca CLI path.** Bare `orca` on this host is the GNOME screen reader outside an Orca
  terminal, so each lane command ran as `"$ORCA_CLI_COMMAND" worktree create ...` with the
  arguments otherwise verbatim.
