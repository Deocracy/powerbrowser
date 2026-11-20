---
phase: "59"
slug: "59-carry-forward-from-v1-5-and-v1-6"
workstream: orca
milestone: v1.7
status: draft
# threats_open = count of OPEN threats at or above workflow.security_block_on severity (the blocking gate)
threats_open: 10
threats_open_below_block_on: 2
threats_total: 29
threats_closed: 17
asvs_level: 1
block_on: high
register_authored_at_plan_time: true
auditor_verdict: ESCALATE
audited_commit: e0c19c54
created: "2026-11-20"
---

# Phase 59 — Security

> Per-phase security contract: threat register, accepted risks, and audit trail.
> Phase 59: Carry-forward from v1.5 and v1.6. Audited 2026-11-20 at commit e0c19c54. Auditor verdict: ESCALATE.

---

## Trust Boundaries

| Boundary | Description | Data Crossing |
|----------|-------------|---------------|
| Deploy SUMMARY records | Phase records committed to the repo | Operational identifiers (App ids, issue numbers); no secrets |
| Repo-controls verifier to GitHub API | `ghGet` reads repository controls with a token | GitHub token (env of one exec call) |
| Crash client to crash service | Crash reporter auto-submit environment | Crash reports |
| Host config (`systemd/legion-pb.nix`) | Runner registration and `/etc/nixos` | Runner registration token (by path only) |
| Owner credentials | Device-flow tokens, PATs, R2 token, signing keys | Credentials and key material |
| Release and push path | Pushes to main, tags, first Linux release | Source, release artifacts, binary-cache keys |
| Real-input harness (`pb-kwin`) | Synthetic input and captures against the desktop | Keystrokes, pointer events, window captures |
| Cloudflare token | Token file used for `wrangler deploy` | Cloudflare API token |

---

## Threat Register

| Threat ID | Category | Component | Severity | Disposition | Mitigation | Status |
|-----------|----------|-----------|----------|-------------|------------|--------|
| T-59-01 | I | deploy SUMMARY records | high | mitigate | .planning/workstreams/deploy/phases/48-error-telemetry-maintenance-sweep-and-watchdog-d/48-05-SUMMARY.md:168 and :219 record the D1 id as 'not committed'. The lines added by lane merge e0547f06 contain no UUID-shaped string, no 32-hex string and no ghp_/github_pat_/private-key text. The recorded values (App ids 5633681 and 5633729, issue #7, '10 per 10 s', 2027-10-06) match .planning/CARRY-FORWARD-v1.7.md:62-77. The 41-04 and 47-04 records give no token file location. | CLOSED |
| T-59-02 | R | operator table in 48-05 | medium | mitigate | git diff e0547f06^1 e0547f06 changes only the three rows for work done live (48-05-SUMMARY.md:168, :169, :171). The watchdog row is still 'open', and the full-tier drill, 60-day probe and secrets-record rows still read 'none yet \| open' (:170, :172, :173). Frontmatter keeps status: partial (:6) and requirements-completed: [] (:19). The new 41-04-SUMMARY.md and 47-04-SUMMARY.md have status partial at :12 and requirements-completed [] at :24. | CLOSED |
| T-59-03 | T | lane scope | medium | mitigate | git diff --stat e0547f06^1 e0547f06 lists exactly the six files_modified: the 41-04, 42-04, 43-05, 47-04 and 48-05 SUMMARYs plus 59-01-SUMMARY.md. It touches no STATE.md, ROADMAP.md, WINDOWS.md or ledger file. The ban is in the brief at 59-01-PLAN.md:76-82. | CLOSED |
| T-59-04 | I | ghGet token threading | high | mitigate | scripts/verify-repo-controls.mjs:72-86: ghGet puts the token only in the env of one exec call, as GH_TOKEN (:76), and its why strings keep only the first stderr line (:78). safeGetter's cache is keyed by path alone (:92-111). Per-slug variables come from tokenVar (:426), and compareApps passes them only on installation list reads (:457, :485). The self-test runs with env {} (:1132). Its planted bot token must reach only the bot repositories path (:1308-1321), and a ghGet check proves the token is absent from argv and the result (:1355-1365). | CLOSED |
| T-59-05 | I | crash client auto-submit | high | mitigate | powerbrowser/shell/PowerBrowserAPI.sys.mjs:429-430: clearEnv sets the value to "". :4497-4499 makes PowerBrowserAPI.clearEnv("MOZ_CRASHREPORTER_AUTO_SUBMIT") the first statement inside handle()'s try, before cliUrl at :4504. scripts/verify-crash-autosubmit-env.mjs derives the variable name and the env_bool rule from upstream (:57-60) and has six plants (:179-186). Both rows are registered at scripts/verify-platform.sh:3829 and :3832. The limit is documented at docs/CRASH-POLICY.md:53: 'a crash before the command-line handler runs still sees the variable'. | CLOSED |
| T-59-06 | E | Services.env outside the boundary | medium | mitigate | powerbrowser/INTERNAL-APIS.md:83 is the Services.env.set row, pointing at PowerBrowserAPI.sys.mjs:430 (clearEnv), which matches the code at HEAD. The boundary rows are at scripts/verify-platform.sh:4173-4175 (internals-boundary, its self-test, internals-catalogue) and the ng-040 rows at :4185-4186. git grep finds no env-service call in powerbrowser/ or theia/extensions outside PowerBrowserAPI.sys.mjs. | CLOSED |
| T-59-07 | E | systemd/legion-pb.nix | high | mitigate | systemd/legion-pb.nix:5-18: the owner installs the file and Claude never applies it, and step 5 is dry-build, then the registration token, then nrs. :20-21: no secret value in the file. :35: tokenFile is given by path only. No ghp_/github_pat_/PRIVATE KEY line is in the file. The option names were checked against the MCP and legion's 26.05 channel (list at 59-02-SUMMARY.md:176-216). /etc/nixos/pb-legion.nix is not present, so the file has not been applied. | CLOSED |
| T-59-SC | T | yarn install in lane setup (plan 59-02) | low | mitigate | docs/BUILD.md:60 gives the audited install, 'yarn install --ignore-scripts --frozen-lockfile'. git diff --name-only cc4c6724^1 cc4c6724 (the 59-02 lane merge) lists no package.json and no yarn.lock, so no package was added. | CLOSED |
| T-59-08 | T | harness fixes for flake and defect rows | high | mitigate | The harness diff of lane merge 03652d3e removes no assertion and swallows no failure. It makes four checks stricter: the verify-nav-keys-live 'finding:' note becomes return fail(...), pan04 adds expect(g4d.buttons === 1), ng-023 adds two failures.push, and page-furniture adds a menu-closed check. Every timeout is unchanged (20000, 10000, 3000 and 8000 ms). $HOME/.cache/powerbrowser-59/t10/results.txt shows 39 and 42 at 3/3. Row 43 failed run 2 and was left open, then closed only after 59-09. Plants still went red: t10/39-prompts-live-self-test-1.log '27 planted faults went red', t10/40-site-identity-live-self-test-1.log 'all 10 planted faults went red'. WINDOWS 28 stays open with no fix. | CLOSED |
| T-59-09 | R | WINDOWS.md closure | medium | mitigate | None of the lane merges (e0547f06, cc4c6724, 03652d3e, d0b78303, ee692f3d, de0ed91a) touches WINDOWS.md, STATE.md or ROADMAP.md. The Closes table at 59-03-SUMMARY.md:41-55 names a coordinator proof per id. The coordinator closed ids in commit 29c37e28, after the proofs: ids 34, 36-38, 40 and 41 resolved at 2026-11-09T05:38Z after proof logs t10/*-1.log (05:16-05:29Z). Ids 39 and 42 resolved at 06:25Z after their third proof runs (06:05Z). Id 43 resolved at 17:03Z after merge-59-09 self-test-1..3 and live-1 (16:21-16:56Z). | CLOSED |
| T-59-10 | T | Theia core | medium | mitigate | Commit 8a3b6e76 (the fix for 41) changes only theia/extensions/chrome-bar/src/browser/side-panel-top-tabs.ts; the fix is at :29-30. No @theia core file is tracked. scripts/diff-theia-core.sh is present and wired into scripts/verify-platform.sh:259. | CLOSED |
| T-59-SC | T | yarn install in lane setup (plan 59-03) | low | mitigate | docs/BUILD.md:60 gives 'yarn install --ignore-scripts --frozen-lockfile'. git diff --name-only 03652d3e^1 03652d3e (the 59-03 lane merge) lists no package.json and no yarn.lock. | CLOSED |
| T-59-11 | I | owner credentials (device-flow tokens, PATs, R2 token, keys) | high | mitigate | The owner credential steps have not run. 59-04-SUMMARY.md:4 reads status: in-progress, and Tasks 4, 5, 7, 8 and 9 were moved to p59-owner (D-16, :22-27). The only owner-log entry (section 3e GH_PAT, piped from 'gh auth token' into gh secret set, name only) is on the unmerged branch ServerDestroyer/p59-owner at 520bd36e, not at HEAD. What does hold at HEAD: git grep finds no ghp_/github_pat_/gho_/ghu_/sk-ant- token and no private key apart from the test fixture scripts/fixtures/tls/pb-fixture.key (f07eb4b6, 2026-10-22), and docs/RELEASING.md:592+ exports the device-flow token without echo. | OPEN |
| T-59-12 | I | MAR signing key material | high | mitigate | 59-04 Task 8 (the key ceremony) has not run. powerbrowser/packaging/mar/ tracks only mar-primary.der, and mar-secondary.der is absent. patches/030-powerbrowser-mar-certificates.patch was last changed in 63479c2d, before Phase 59. There are no reply fields. No .p12 or MAR private key is tracked. | OPEN |
| T-59-13 | E | ledger amendments | medium | mitigate | Task 2 was superseded by D-14 (59-CONTEXT.md:49; 59-04-SUMMARY.md:176-188), so no drop command ran. The history entries v407-v414 in commit 3c846e78 are set-status to 'open' only, which makes the rows stricter. Enforcement at HEAD: .claude/hooks/ledger-verify-hook.py:18-22 and :33-36 refuses agent approve, reject and drop, and refuses set-status into deferred-approved or dropped. The hook was active and blocked this audit's own grep of the amend script. The two lock-checked test files changed by lane 59-03 were left for the owner's lock-checks (59-04-SUMMARY.md:127-130). | CLOSED |
| T-59-14 | E | runner registration token and /etc/nixos | high | mitigate | 59-04 Task 9 has not run. systemd/legion-pb.nix:17-18 and :35 name the steps and give the token by path only. However, the owner log has no section 5 entry, the step 5 'sudo -u pb-runner test -r' results are not recorded, no dry-build or nrs is recorded, and /etc/nixos/pb-legion.nix is not present. | OPEN |
| T-59-15 | T | lane merges | medium | mitigate | Ancestry shows the merge order e0547f06 (59-01), then cc4c6724 (59-02), then 03652d3e (59-03). Their second parents d495291b, 20203e6e and 352eb0ab equal the refs/heads/ServerDestroyer/p59-01..03 tips. $HOME/.cache/powerbrowser-59/quick-t6-m01.log, quick-t6-m02.log and quick-t10.log each end 'verify-platform: PASS -- all checks passed' with scan-brand-residue PASS. Ids were closed only after proofs (see T-59-09). | CLOSED |
| T-59-16 | I | Cloudflare token file used for wrangler deploy | medium | mitigate | The token has not been rotated. $HOME/.config/cloudflare/pb-token still exists, and docs/RENEWALS.md:22 still shows expiry 2026-12-06 and last action 2026-11-06. The scheduler wrangler deploy has not run (59-04-SUMMARY.md:203-210), and the rotation (59-07 Task 8) has not run. | OPEN |
| T-59-17 | T | D-12 push | high | mitigate | The push happened without a recorded checkpoint. The reflog shows 'update by push' for origin/main at eb67f654 (2026-11-09 08:29:23 -0800) and for origin/ServerDestroyer/v1.7-Orca-integration at ee692f3d (08:29:25). Both pushes are fast-forward and no v1.6 tag exists. Missing: 59-05-SUMMARY.md, the box answer recorded verbatim, the ls-remote read-back, the verify.yml run link and the ng074 result. .planning/workstreams/orca/ROADMAP.md:69 leaves 59-05 unchecked. main was pushed a second time on 2026-11-10 at 2b5f4609 (sidecar Origin hotfix), outside the D-12 single push. | OPEN |
| T-59-18 | T | first Linux release | high | mitigate | 59-05 Task 5 has not run: there is no Release, no approval record, no hop drill and no withdraw.yml record. Ruling D-59 (.planning/workstreams/orca/DECISIONS.md:505-512) moved the first release.yml Linux run to the next version but keeps plan 59-05 in v1.7. | OPEN |
| T-59-19 | I | Anthropic and binary-cache credentials | high | mitigate | 59-05 Tasks 3 and 6 have not run, and no caps or public keys are recorded. At HEAD nix/cache.json holds placeholders only (@CACHIX_PUBLIC_KEY@, @R2_PUBLIC_KEY@), flake.nix has no nixConfig key material, and there is no Anthropic key anywhere in the tree. | OPEN |
| T-59-20 | I | TEL-13 flip | high | mitigate | 59-05 Tasks 7-8 and 59-07 Task 3 have not run. scripts/generate.mjs:1550 has CRASH_REPORTER_ENABLED = false and .mozconfig:15 has --disable-crashreporter, so the reporter is compiled out and no crash report leaves at HEAD. Missing: a per-target seam, a refusal of a global flip, and a smoke-launch record showing the dialog. The precondition gate crash-autosubmit-env is present at scripts/verify-platform.sh:3829. | OPEN |
| T-59-21 | T | real input via pb-kwin | high | mitigate | scripts/lib/pb-kwin.mjs:125-136 is the gate: resourceClass must contain powerbrowser and the pid must be one this run launched. isRunWindow is at :139-146. captureShell gates before the grab (:154-176), and gateAfterGrab deletes the PNG on refusal (:178-186). captureActive is gated (:195-203), osKeys gates before ydotool (:210-220), and osPointer gates at :286 and :292. No other script under scripts/ invokes ydotool. The self-test row is at scripts/verify-platform.sh:6558, and 59-06-SUMMARY.md:21 records it PASS first. | CLOSED |
| T-59-22 | R | verdict recording | high | mitigate | 59-06 has not run its judged items. 59-06-SUMMARY.md:4 reads status in_progress and its Verdicts table (:12-15) is empty. No commit since 2026-11-08 touches .planning/milestones/v1.5-phases/ or v1.5-REQUIREMENTS.md. The checks were deferred by D-18 (59-CONTEXT.md:53). No mechanism exists in the tree that enforces one item per box, owner words only, or ticks only with passed item ids cited. | OPEN |
| T-59-23 | I | captures | low | accept | The acceptance is documented in the plan register at 59-06-PLAN.md:291: captures are of the test profile and test pages only and stay under the phase captures directory. No Phase 59 capture has been made yet, since the 59-06 Verdicts table is empty. | CLOSED |
| T-59-24 | T | redate-windows.cjs and exclusions | high | mitigate | Plan 59-07's redate-windows.cjs was superseded by scripts/redate-windows.mjs (59-07prep-SUMMARY.md:31 and :108-109; 59-04-SUMMARY.md:343), and is judged there. The tool refuses a non-open id (:47) and asserts counts and statuses before the rename (:42, :56-59). It writes a temp file and renames it (:60-62), takes withLedgerLock and has a dry run (:65, :70-75). Its self-test (:84-144) is registered at scripts/verify-platform.sh:3680. In the gate, ledger_entry_is_open (:7058) and :7179 'FAIL (exclusion no longer applies)' bind exclusions to open ids. Every exclusion id (25, 28, 29, 30, 31, 32, 35, 51, 69) is open in WINDOWS.md. The only waived entries are 22 and 23, waived 2026-11-04, before Phase 59. | CLOSED |
| T-59-25 | T | v1.6 tag and the final push | high | mitigate | 59-07 Tasks 11-14 have not run: git tag -l has no v1.6, there is no 59-07-SUMMARY.md, and there is no D-10 or D-11 box record. main was pushed on 2026-11-10 11:52 -0800 at 2b5f4609 outside the D-11 box. That push is recorded only as a hotfix in 67-02-SUMMARY.md. | OPEN |
| T-59-26 | I | Cloudflare token powerbrowser-claude | high | mitigate | The token has not been rolled. $HOME/.config/cloudflare/pb-token still exists. docs/RENEWALS.md:22 shows no rotation (expiry 2026-12-06, last action 2026-11-06). 59-07 Task 8 has not run. | OPEN |
| T-59-27 | R | override closeout | medium | mitigate | The override closeout has not run (59-07 Tasks 9-12). .planning/workstreams/deploy/v1.6-MILESTONE-AUDIT.md does not exist. The deploy SUMMARYs 44-01, 50-04, 52-05 and 57-04 are absent; their text exists only in 59-07-CF18-RECORDS.md. The D-09 date ('next version', D-46) is in WINDOWS.md, but not in any audit or in those SUMMARYs. | OPEN |

Threat flags (from SUMMARY `## Threat Flags` sections): none. No SUMMARY has a '## Threat Flags' heading, so there are no threat-flag entries and no summary file to cite.

*Status: open · closed · open — below high threshold (non-blocking)*
*Severity: critical > high > medium > low — only open threats at or above workflow.security_block_on count toward threats_open*
*Disposition: mitigate (implementation required) · accept (documented risk) · transfer (third-party)*
*T-59-SC appears in both plan 59-02 and plan 59-03 and is listed once per plan.*

---

## Escalations

1. Phase 59 is not finished, so 10 high-severity threats cannot close yet: T-59-11, T-59-12, T-59-14, T-59-17, T-59-18, T-59-19, T-59-20, T-59-22, T-59-25 and T-59-26. 59-04 is in progress: its owner Tasks 4, 5, 7, 8 and 9 were moved to p59-owner by D-16. Only section 3e is logged, on the unmerged branch ServerDestroyer/p59-owner at 520bd36e, and that workspace was closed on 2026-11-18. 59-05 and 59-07 have no SUMMARY, and 59-06 has an empty Verdicts table under D-18. The owner needs to decide whether to re-run /gsd-secure-phase 59 after 59-05, 59-06 and 59-07, or to record which of these threats move to the next version.
2. T-59-17: main (eb67f654) and ServerDestroyer/v1.7-Orca-integration (ee692f3d) were pushed on 2026-11-09 08:29 -0800, and the reflog shows 'update by push'. Nothing records the D-12 box answer, the ls-remote read-back, the verify.yml run or the ng074 result. main was also pushed on 2026-11-10 at 2b5f4609, outside the D-12 single push and the D-11 box. The owner needs to confirm both pushes were made on his word so they can be written into the 59-05 record.
3. T-59-18 and the binary-cache half of T-59-19: ruling D-59 (DECISIONS.md:505-512) moved the first release.yml Linux run and the container tarball to the next version, but keeps plan 59-05 in v1.7, and 59-05 Task 5 is that release. The owner needs to decide whether these threats stay in Phase 59's register or are moved with the release.
4. T-59-26 (and medium T-59-16): the Cloudflare token powerbrowser-claude has not been rolled, and its file is still at $HOME/.config/cloudflare/pb-token. docs/RENEWALS.md:22 gives its expiry as 2026-12-06. Rotating it is an owner-only step (59-07 Task 8).
5. T-59-12 and T-59-14: the MAR secondary-key ceremony and the legion runner install, including the step 5 checks that pb-runner cannot read the key dir or the token file, are owner-only steps (59-04 Tasks 8 and 9) and have not run.

---

## Accepted Risks Log

| Risk ID | Threat Ref | Rationale | Accepted By | Date |
|---------|------------|-----------|-------------|------|
| AR-59-01 | T-59-23 | The acceptance is documented in the plan register at 59-06-PLAN.md:291: captures are of the test profile and test pages only and stay under the phase captures directory. No Phase 59 capture has been made yet, since the 59-06 Verdicts table is empty. | Plan register (59-06-PLAN.md:291) | 2026-11-20 |

*Accepted risks do not resurface in future audit runs.*

---

## Security Audit Trail

| Audit Date | Threats Total | Closed | Open | Run By |
|------------|---------------|--------|------|--------|
| 2026-11-20 | 29 | 17 | 12 | security auditor (commit e0c19c54; verdict ESCALATE) |

Auditor notes:

- Phase 59 (carry-forward from v1.5 and v1.6). ASVS level 1, block_on high. The register has 29 entries: T-59-01 to T-59-27 from plans 59-01 to 59-07, plus T-59-SC, which appears in both 59-02 and 59-03. 17 are closed and 12 are open: 10 open at high severity, which block, and 2 open at medium (T-59-16, T-59-27), which do not. threats_open = 10 counts the blocking high-severity open threats; the frontmatter threats_open of 12 is the total open count requested for this file.
- Plans 59-08 and 59-09 (gap closure) have no threat_model. No SUMMARY has a '## Threat Flags' heading, so threat_flags is empty.
- Superseded items and where each was judged:
  - 59-04 Task 2 was replaced by D-14 (a reopen, not drops); T-59-13 was judged on the hook enforcement and the ledger history.
  - 59-04 Tasks 4, 5, 7, 8 and 9 were moved to p59-owner by D-16 and have not run.
  - 59-07's redate-windows.cjs was replaced by scripts/redate-windows.mjs (59-07prep, then D-46 'next version'); T-59-24 was judged on the .mjs.
- Every closed code-side mitigation was checked at HEAD e0c19c54:
  - repo-controls token threading.
  - The 57-08 clear and its derived gate.
  - The Services.env.set catalogue row.
  - legion-pb.nix.
  - The pb-kwin real-input gate.
  - The re-date tool and the binding of exclusions to open entries.
  - Lane scope, merge order, and proof-before-close, checked against git history and the run logs in $HOME/.cache/powerbrowser-59.
- Every open item belongs to an owner-gated task that has not run. Several of them have no exposure at HEAD: the crash reporter is still compiled out, there is no release and no v1.6 tag, and no credential or private MAR key is in the tracked tree. The one exception is the 2026-11-09 D-12 push, which happened without a recorded decision. Nothing was modified or written.

---

## Sign-Off

- [ ] All threats have a disposition (mitigate / accept / transfer)
- [x] Accepted risks documented in Accepted Risks Log
- [ ] `threats_open: 0` confirmed
- [ ] `status: verified` set in frontmatter

**Approval:** pending
