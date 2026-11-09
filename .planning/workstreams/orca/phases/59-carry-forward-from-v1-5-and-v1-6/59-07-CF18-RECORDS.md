# 59-07 CF-18 record text (prepared by lane p59-07prep, 2026-11-09)

Paste material for 59-07 Task 9 ("v1.6 records, every finished deploy plan has its SUMMARY",
CF-18). One section per unexecuted v1.6 owner plan. Each section has two parts:

- **Recorded by Phase 59 so far**: what is already in the tree on the v1.7 branch, with the
  Phase 59 SUMMARY or commit that records it. Nothing here is new; every line cites its source.
- **Waits on the owner log**: what 59-07 reads from `59-OWNER-LOG.md` (branch
  `ServerDestroyer/p59-owner`, D-16) or from the 59-05 SUMMARY before it can write the final
  SUMMARY. An item not reported there by the time 59-07 runs is re-dated under D-09 with the
  date Chris names, not claimed.

Sources read for this file: 59-01-SUMMARY.md, 59-02-SUMMARY.md, 59-04-SUMMARY.md (through the
59-09 merge record), 59-05-PLAN.md, the six deploy PLAN.md files, the 41-04, 47-04 and 57-08
deploy SUMMARYs, `.planning/CARRY-FORWARD-v1.7.md` section 4, `docs/RENEWALS.md`,
`docs/RELEASING.md`, and `59-OWNER-LOG.md` at commit 520bd36e (one entry: OWNER-PASS §3e,
`GH_PAT` set in Deocracy/powerbrowser-status, 2026-11-09). 57-08 is not listed below: its SUMMARY
exists with `status: complete` (lane 59-02, commit d1584703) and only its live dialog proof is
owed, on the 59-07 Stage F reporter build (see 57-04).

Rule for every final SUMMARY (59-01 precedent, STATE.md "A SUMMARY can record a partial plan"):
`requirements-completed` stays empty unless the plan's own requirement is proven live;
`status: partial` unless every task is done; secret NAMES only; cite the OWNER-LOG entry date.

---

## 41-04 — Repository controls and GitHub Apps, owner checkpoint (OWNER-PASS §1, §8)

SUMMARY state: exists, `status: partial`, created by 59-01 (section "Live state at parking").
59-07 appends a "Phase 59 outcome" section.

### Recorded by Phase 59 so far

- 59-01 (commit on lane p59-01, merged e0547f06): the "Live state at parking" record. Done live by
  2026-11-07: Apps powerbrowser-bot (5633681) and powerbrowser-clock (5633729) installed; `claude`
  and `slack` Apps limited to the other 30 repos (R10); `apply-repo-controls --yes`, 25 writes;
  labels; tag probe refused; runner group restricted to `release.yml@main`; variables
  `BOT_APP_ID`, `BOT_APP_CLIENT_ID`, `OWNER_LOGIN`; the bot key in environments bot, release and
  descriptor and in powerbrowser-updates; Cloudflare Pages App declared; CodeQL default setup.
- 59-02 (CF-15, merged cc4c6724): the DEVICE-FLOW token input exists. `repo-controls` reads each
  App installation list with a per-slug `REPO_CONTROLS_TOKEN_<SLUG>` token; documented in
  docs/RELEASING.md "App installation read-back". `repo-controls-self-test` PASS on the merged
  tree (59-04 Merges). This is 41-04 Task 3's DEVICE-FLOW edit, done.
- 59-04 Task 4 probes (2026-11-08): release environment holds `BOT_APP_PRIVATE_KEY`, variables
  `R2_MAR_BUCKET` and `CLOUDFLARE_ACCOUNT_ID`.
- 59-04 Tasks 5 and 7 were moved to p59-owner (D-16); nothing from them is recorded yet.
- Gate: `repo-controls|31` and `ng074-ci-green-on-main|31` stay in `GATE_KNOWN_OPEN_EXCLUSIONS`
  until the live row is green and entry 31 closes.

### Waits on the owner log

- 59-04 Task 7 (OWNER-PASS §1 steps 9 and 14): device-flow tokens for powerbrowser-bot and
  powerbrowser-clock, then a live `repo-controls` run. The three third-party Apps (`slack`,
  `claude`, `cloudflare-workers-and-pages`) cannot use device flow: their lists are green only if
  Chris supplies a per-slug token at the checkpoint, otherwise those three lines are re-dated
  under D-09 (CONTEXT "Research facts"). Final SUMMARY quotes the `repo-controls: PASS` line or the
  re-date.
- 41-04 Task 2's twelve reply fields (41-04-PLAN.md Task 2 resume-signal), still not given.
  Field 4 ("no private key generated") cannot be confirmed for powerbrowser-bot (59-01 note).
- 41-04 Task 3's remaining halves: the five RELEASING.md subsections and the Applied dates.
- 59-04 Task 5 (CF-02, OWNER-PASS §1 steps 12 and 13): notifications, the drill from
  HarmonySprings, archive of the old repository.
- `ng074-ci-green-on-main`: needs a `verify.yml` run on a pushed head, so it follows the D-12
  push in 59-05 Task 1 and 2.
- ROADMAP Phase 41 criteria 1, 2, 4 and 5 are claimed only after the reply and the green live
  row.

---

## 44-01 — Secondary MAR key ceremony and two-DER patch 030 (OWNER-PASS §4, CF-03)

SUMMARY state: **absent**. 59-07 creates it (partial unless all three tasks are done).

### Recorded by Phase 59 so far

- 59-04 Task 8 (OWNER-PASS §4: MAR key ceremony, release secrets, then 44-01 Tasks 2 and 3) was
  moved to p59-owner (D-16). No entry in 59-OWNER-LOG.md at 520bd36e.
- 59-04 Task 4 probe (2026-11-08): `R2_MAR_WRITE_TOKEN` absent from the release environment of
  Deocracy/powerbrowser.
- `powerbrowser/packaging/mar/mar-secondary.der` does not exist in the tree; patch 030 carries
  one DER. Nothing of 44-01 has run.
- Gate: `ng065-mar-signature-enforced|30` and `mar-update-hop|30` stay excluded while entry 30 is
  open; the live ng065 proof is full-tier and runs on the 59-07 Stage F objdir (D-05).

### Waits on the owner log

- Task 1, the ceremony on legion in a new NSS dir `mar-secondary/`, and its six-field
  resume-signal: DER SHA256, ceremony date, machine, both NSS paths, both nicknames
  (`powerbrowser-mar`, `powerbrowser-mar-secondary`), two offline media as counts and labels.
  Never a password, `.p12` bytes or `key4.db`. The SUMMARY records those six fields verbatim from
  the log.
- Then Claude's Tasks 2 and 3 (track the DER, regenerate patch 030 from the applied tree with
  `scripts/regenerate-patches.sh`, prove `--check` and `--quick`, extend ng065 in place with the
  secondary-only fifth case). These run in the coordinating tree after the log entry; they touch
  `patches/` and `upstream/`, so they wait for the 59-07 Stage F build window (D-05).
- Release secrets of §4 (`R2_MAR_WRITE_TOKEN` and the rest named in OWNER-PASS §4), by name only.
- If §4 is not done when 59-07 runs the gate: 44-01 stays `status: partial`, SEC-05 unclaimed,
  and the section is re-dated under D-09.

---

## 47-04 — Hosting, website and mail, owner checkpoint (OWNER-PASS §2, §3)

SUMMARY state: exists, `status: partial`, created by 59-01. 59-07 appends a "Phase 59 outcome"
section.

### Recorded by Phase 59 so far

- 59-01 record. Done live by 2026-11-07: zone on Cloudflare; Pages projects
  `powerbrowser-website` and `powerbrowser-updates`, Git-linked; four pages byte-equal and the
  404 page live; update rule six placeholders plus splat; security.txt to 2027-10-06; Email
  Routing for security@, contact@, privacy@ to christopher@deocracy.org, three test mails.
- 59-04 Task 3 (commit e79aa086, 2026-11-08), the §2 remainder, done: postal address present in
  website-staging/privacy.html:87; `POWERBROWSER_DOWNLOAD_URL` is
  `https://powerbrowser.org/download` (powerbrowser-update-copy.ts:50, hand-written literal, no
  generate.mjs re-run); website push a62fe0d3 in Deocracy/powerbrowser-website, live; `/`,
  `/download`, `/privacy`, `/legal` 200 and byte-equal to website-staging/; eleven-segment update
  GET 200 and byte-equal; unknown BUILD_TARGET 404; `--only update-copy`,
  `--only updates-repo-static-self-test`, `--only updates-repo-static` PASS; `--quick` 328 PASS.
  That closes the two parked §2 items of the 59-01 record.
- 59-04 Open values (D-15): Cloudflare stays on free tiers; whether a payment method is on file is
  UNKNOWN to the owner; Email Routing destination stands.
- 59-04 Task 4 probes: Workers `powerbrowser-crash-submit` and `powerbrowser-events` exist;
  scheduler not deployed; Watchdog `disabled_manually`; status Pages not enabled.

### Waits on the owner log

- 47-04 Task 1's twelve-field reply, the parts CARRY-FORWARD does not record: Namecheap inventory
  (step 1), Cloudflare 2FA date and recovery-code attestation (step 2), the R2 payment answer
  (steps 2 and 11; D-15 follow-up: Chris checks the billing page), senders of the three test
  mails (step 6), the probe lines (step 9) and row outputs (step 10). The probe and row outputs
  are now in 59-04 Task 3 and can be cited from there; the rest comes from the log.
- 47-04 Task 2, the RELEASING.md live record for §2 (the `updates-repo-static` rows are already
  green, 59-04 Task 3).
- 59-04 Task 4 Claude follow-ups after the log reports the secrets set (`CLOCK_PRIVATE_KEY`,
  `R2_MAR_WRITE_TOKEN`; `GH_PAT` is done, log 2026-11-09): scheduler `wrangler deploy`, Watchdog
  enable, Upptime dispatch, status Pages, RENEWALS rows.
- CF-13, the rotation of Cloudflare token `powerbrowser-claude` (expires 2026-12-06, RENEWALS
  row owned by 47-04): Chris rolls it after the last Claude-run Cloudflare step above, then
  deletes its file on legion. 59-07 records the rotation date; the token is named by label only.
- ROADMAP Phase 47 criteria 1 to 5 are claimed only with the reply and the Task 2 record.

---

## 50-04 — First public Linux release and the pinned KNOWN-ISSUES report (OWNER-PASS §9, CF-08)

SUMMARY state: **absent**. 59-07 creates it.

### Recorded by Phase 59 so far

- release-train.yml carries the GH-15 KNOWN-ISSUES report step (3 occurrences in the file) and
  docs/RELEASING.md has a "first public release" section: 50-04 Task 1's artifact exists in the
  tree, but no 50-04 SUMMARY records it and no release has run it. Record it as present, not as
  proven.
- 59-04 Task 4 probe (2026-11-08): every release-train.yml push run since 2026-11-07 failed in
  0 s ("workflow file issue"; actionlint: `runner` context in a job-level `env:` at line 1968).
  Fixed by gap-closure lane 59-08 (commit 03b5f9b3: `FIX_DIFF` set per step; verify-workflows
  rule `job-env-context`), merged d0b78303; `workflows` and `workflows-self-test` PASS, actionlint
  exit 0 on the merged tree. The fix must be on GitHub `main` before §3a's dry run or the
  scheduler clock dispatches the workflow (59-04 "Before the D-12 push").
- The D-12 push gate is 59-05 Task 1 and 2. v1.5 is already on origin; the end set is `main`,
  `v1.6` and the v1.7 branch (D-12).
- 59-04 Task 2 / D-14: NG-078 (release pipeline) and NG-079 (updates host) are reopened on
  Phase 59 and close with evidence in 59-05.
- Gate: the ten `|30` rows (packaged launch, portable ELF, install matrix, MAR hop and the rest)
  and `channel-live|31`, `codeberg-mirror-live|31`, `upptime-sweep-live|31` stay excluded until
  the release and the hop exist.

### Waits on the owner log

- 59-05 Task 5 (OWNER-PASS §9), the 50-04 Task 2 checkpoint sequence: withdraw.yml and
  release-probe.yml placed in Deocracy/powerbrowser-updates and the five `release-probe:` lines
  (never delete probe-1, A3); bump PR merge with the merge SHA; `release` approval and the
  Release's asset list; `descriptor` approval after Chris's own N-1 to N hop (R13; a failed hop
  runs withdraw.yml, never deletes a Release or tag); `/download` live. The six-field reply of
  50-04-PLAN.md:260: merge SHA, run html_url, hop green with evidence path, /download live with
  date, descriptor approved with date plus owner-hop date, DONE issue number plus close date.
- Task 3's criterion-5 observation values (layer-3 asset hosts during the real hop; sweep
  runner-online, channel-liveness and download-count rows), read from the same run.
- Whether the pinned KNOWN-ISSUES issue was created once and pinned (Task 1 live behaviour),
  from the first PUBLISHED train.
- If no bump PR exists when every other 59-05 task is done, §9 is recorded for D-09 (59-05
  Task 5 text; the 43-05 exit test keeps its own 2026-11-24 date). The ESR calendar decides the
  release (153.7 on 2026-11-10, else 153.8 on 2026-11-24); 59-07 never picks a date.
- TRAIN-10, REL-02, GH-15, UPD-16, REL-03 are claimed only with the six fields.

---

## 52-05 — Claude fixer live half: Console workspace, credential, real red PR (OWNER-PASS §7, CF-06)

SUMMARY state: **absent**. 59-07 creates it.

### Recorded by Phase 59 so far

- Nothing live. 59-05 Task 3 owns OWNER-PASS §7 (CF-06) and reads 52-05-PLAN.md lines 99-129 for
  the owner commands. No entry in 59-OWNER-LOG.md at 520bd36e.
- Static state in the tree (for the SUMMARY's "before" line): docs/RELEASING.md:672 "Credential
  state: pending"; docs/RENEWALS.md rows 29 to 33 (fixer key, fixer workspace monthly limit,
  federation rule and organization ID, fallback key, Claude Code CLI pin 2.1.314) all "unknown"
  expiry and "pending"; `fix-gate-self-test`, `fixer-prepare-self-test`, `fixer-isolate-self-test`
  PASS in `--quick` (this lane, 2026-11-09).
- The fixer dispatches release-train.yml, so the 59-08 workflow fix (above, 50-04) is a
  precondition for the live red-PR proof.

### Waits on the owner log

- 59-05 Task 3: the fixer Console workspace with a monthly limit, separate from triage; OIDC
  federation rule or the stored fixer-environment key (fallback only if federation is blocked,
  no id-token anywhere); the triage `ANTHROPIC_API_KEY`; repository variables
  `ANTHROPIC_FEDERATION_RULE_ID` and `ANTHROPIC_ORGANIZATION_ID` (variables, not secrets); the
  staged drill sign-off; the dispatch on a real red PR, `fix-gate` PASS on the fixer PR, and the
  owner merge. FIX-10 deadline 2027-05-27 (ESR 175 train, RENEWALS row 42).
- docs/RELEASING.md "Fixer authentication" outcome replacing "pending", the spend-limit record,
  and the FIX-10 merge SHA; RENEWALS rows 29 to 33 given dates. 59-07 Task 9 does not edit these
  itself unless the log carries the values; otherwise the section is re-dated under D-09.
- FIX-10, FIX-05, FIX-12 are claimed only with the fix-gate PASS and the merge.

---

## 57-04 — TEL-13 crash-reporter retirement flip, owner-gated (OWNER-PASS §12, CF-11)

SUMMARY state: **absent**. 59-07 creates it. `DSH-BLOCKED.md` does not exist in the phase
directory (only `BLOCKED.md`); 59-05 Task 8 writes it per 57-04 Task 2.

### Recorded by Phase 59 so far

- D-13 (Chris, 2026-11-08): the Windows-release condition of owner decision 9 is lifted; the
  switch-on runs against the Linux release only; Windows gets its own switch-on with CF-10. The
  receiver on crash.powerbrowser.org is live.
- 59-02 (merged cc4c6724): plan 57-08, 57-04's prerequisite, is done except its live dialog
  proof: `PowerBrowserAPI.clearEnv` clears `MOZ_CRASHREPORTER_AUTO_SUBMIT` first in the
  single-instance handler; `crash-autosubmit-env` and `crash-autosubmit-env-self-test` registered
  (5b7ce54b) and PASS; docs/CRASH-POLICY.md records both auto-send paths closed; 57 BLOCKED.md B6
  closed; 57-08-SUMMARY.md `status: complete`.
- 59-04 Task 4: `--only events-worker` PASS, `--only watchdog` PASS; Workers
  `powerbrowser-crash-submit` and `powerbrowser-events` exist on the account.
- 59-04 Task 2 / D-14: NG-080 (crash-ingest host) reopened on Phase 59, closes with evidence in
  59-05.
- 57-04 Task 1 (the staged one-line flip in scripts/generate.mjs with gates green on the flipped
  tree) has not run; `--disable-crashreporter` is still emitted.

### Waits on the owner log

- 59-05 Task 7 (Claude, CF-11 criteria 1 and 2): `crash_report = "https://crash.powerbrowser.org/submit"`
  under `[urls]` in configuration.toml, the allowlist row `urls.crash_report`, generate.mjs
  re-run, `verify-endpoints.sh --layer 3 --crash-ping` PASS and `--positive-control` PASS. This
  is Claude work recorded in the 59-05 SUMMARY, not the owner log.
- 59-05 Task 8 (OWNER-PASS §12): 57-04 Task 1 executed (flip prepared, gates proven on the
  flipped tree, tree restored), DSH-BLOCKED.md written with the Windows condition marked lifted
  by D-13, Chris's word "flip" in the box, then the Linux-only flip applied (if generate.mjs has
  no per-target seam, 59-05 stops and asks instead of flipping globally), docs/CRASH-POLICY.md and
  the RETIRED write per 57-04.
- On the 59-07 Stage F objdir (D-05): the reporter-enabled tier-3 build,
  `./mach buildsymbols`, and the smoke launch with `MOZ_CRASHREPORTER_AUTO_SUBMIT=1` showing the
  client dialog, which is also 57-08's deferred live proof. 59-07 Task 1 builds that objdir;
  these rows run after it.
- The standing crash-reporter exclusion row (v1.2 requirements) is referenced, never edited by
  57-04 or 59-07 (57-04 prohibitions).
- TEL-13 is claimed only after the flipped Linux build has been smoke-launched (57-04 backstop
  truth: a flipped tree never smoke-launched is not shippable).

---

## Checklist for 59-07 Task 9

- Create 44-01, 50-04, 52-05, 57-04 SUMMARYs; append "Phase 59 outcome" to 41-04 and 47-04; the
  57-08 SUMMARY gets its live-proof line.
- The Task 9 `<verify>` greps every one of the seven files for "Phase 59"; the four new files
  satisfy it only once written.
- Every re-dated item names the D-09 date Chris gives in 59-07 Task 6, verbatim, as
  "Re-dated to <date> (Phase 59 D-09)", the same string `scripts/redate-windows.mjs` writes into
  WINDOWS.md.
- No value from the owner log beyond secret NAMES, dates, SHAs, run URLs and the 44-01 DER hash.
