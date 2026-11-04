# v1.6 Deployment setup — finish plan

Written 2026-11-03 for the Claude session that brings milestone v1.6 (workstream `deploy`) to a
close with GSD. It supersedes HANDOFF.md's "Next autonomous step: None". The owner answered every
scoping question below on 2026-11-03; treat §1 as settled and do not re-ask it.

Evidence for every step (exact commands, secret names, file:line sources, per-phase state) is in
[FINISH-SURVEY.md](FINISH-SURVEY.md), produced by a read-only 23-agent survey the same day. Where
the survey and this file disagree, this file wins; where the survey's critic (§C) corrected a
reader, the correction wins.

---

## 0. Rules for this session

- **Work in the main checkout** `/home/chris/coding/Power-Browser`, branch `main` (owner ruling
  2026-11-03: keep the work under `~/coding`; `workspace/deploy` is fully merged into main). The
  deploy worktree at `~/gsd-workspaces/deploy/` is not used. Main's root `.planning/` is v1.5, so
  every GSD write must go through `--ws deploy` (next rule).
- **`--ws deploy` on every GSD command and every `gsd-tools` call.** Run `/gsd-workstreams switch
  deploy` first and confirm `query workstream.get`. A missing `--ws` writes into v1.5's root files
  (survey §B gsd-close, pitfalls P1–P2).
- **Skip `/gsd-cleanup`.** It is root-only and runs `git branch -D` on gone-upstream branches (P3).
- **Verify last.** No code commit between the verify pass, the audit and complete-milestone, or
  the VERIFICATION digests go stale (P4).
- **Model tiers:** Opus for hard or security-sensitive work (phases 44, 49, 52, 57, all gap code),
  Sonnet for medium, Haiku for bookkeeping. The untracked `deploy/config.json` sets verifier and
  completion to haiku; override per agent, do not edit that file.
- **Every owner question goes in an AskUserQuestion box**, recommended option first. Never end a
  turn on a prose question.
- **No push, workflow dispatch, secret write or other network write without the owner.** The owner
  performs the live steps; Claude prepares exact commands and records results.
- **Concurrent sessions:** re-read STATE.md and `git log` before acting; commit with explicit
  paths; never `-a`, `--amend`, `git add -A` or `git stash`. Stage new files before trusting
  `scan-brand-residue`. Run `node scripts/generate.mjs` before `--quick`.
- **Do not touch `upstream/` or `objdir*` while another session's build runs** (a `./mach build`
  was running in main's checkout on 2026-11-03). Check `pgrep -af 'mach build'` first.
- PID 2169340 is a stale wait loop from another session (its `pgrep` pattern matches itself; it
  never exits). It is harmless. Leave it unless the owner says to kill it.

## 1. Owner rulings, 2026-11-03

| # | Topic | Ruling |
|---|---|---|
| R1 | Close type | **Linux-path close.** Finish phases 40–54 live (Linux first, then Windows). Record the rest as dated deferrals and close with `override_closeout`. |
| R2 | Windows (54) | **Stays in v1.6, ships unsigned.** Claude writes the `windows-latest` sidecar job and an unsigned publish path (descriptor and channel-live; never a dependency of the Linux path). **Amended 2026-11-04 (owner answer A2):** the Windows files publish after the Linux publish of the same run to the MAR origin `downloads.powerbrowser.org/<tag>/`, not to the GitHub Release, which stays immutable and Linux-only (plan 54-11). Owner supplies a Windows 11 ISO and licence for the `pkg-win11` libvirt VM on legion. TEL-13 crash-reporter flip follows the Windows release and stays in v1.6. |
| R3 | Windows installer (54-02) | **Full rebrand.** New patch in the stack moves `Software\Mozilla` keys (installer and app readers) to `Software\PowerBrowser`; remove the Mozilla uninstall survey (`uninstaller.nsi:153`); owner supplies wizard bitmaps and an `.ico` under `brand/` with a signed review in `brand/HUMAN-REVIEW.md`; replace `Title="Mozilla Firefox"`. Patches are regenerated, never hand-edited. |
| R4 | macOS (55) | **Deferred to v1.7.** Reword its goal from "signed, notarized" to "ad-hoc signed" so the deferral is accurate. WINDOWS.md entries 22 (Team ID) and 23 (DMG placeholders) move with it. |
| R5 | ESR 175 (58) | **Dated deferral.** Built code stays. 58-03 T2–T4 (dual-build measurement, rebase, ship) are due between 2027-05-27 and 2027-09-07; record that in the audit. |
| R6 | Package channels (56) | **Nix flake + binary cache (x86_64-linux) only** in v1.6. Flathub (PKG-20), winget (DIST-04) and the Homebrew cask (DIST-11/12) deferred to v1.7. |
| R7 | Legal identity | **Deocracy** is the trademark holder. Change `configuration.toml` vendor, copyright and trademark strings (lines ~32, 33, 49, 50), the WEB-01 footer sentence and README.md:98 to Deocracy in one commit, then regenerate. Flatpak/winget IDs are decided in v1.7 with those channels. |
| R8 | Org move | **Full move DeBIOS-Foundation → Deocracy.** Merge `deocracy/main` into main (identical-content commit 9cb73a33; no force-push), push main to Deocracy *before* the main-integrity ruleset is applied, rename remotes (`origin`→`debios`, `deocracy`→`origin`), fix every `DeBIOS-Foundation` slug in live commands and docs (historical run URLs in SUMMARY/UAT stay as records), and **archive `DeBIOS-Foundation/powerbrowser`** read-only with a pointer to Deocracy after the push. Other DeBIOS repos and domains are not part of this move. |
| R9 | Gap plans | **All approved**: write and execute them before the owner live pass (list in §4). |
| R10 | Org Apps `claude`, `slack` | **Used elsewhere: restrict.** Owner sets each to "Only select repositories" excluding `powerbrowser`, `powerbrowser-updates`, `homebrew-tap`. Claude scopes the repo-controls check to installations touching those repos (reviewed commit). |
| R11 | Owner login | `OWNER_LOGIN=ServerDestroyer` (repository variable). Claude switches `release-train.yml:178` and `:1619` from `github.repository_owner` to `vars.OWNER_LOGIN` and reruns `workflows-self-test`. |
| R12 | First Linux release | **Wait for the train's own bump PR** (153.7 window 2026-11-10, else 153.8 on 2026-11-24). N-1 for the hop is an unpublished earlier-buildID tarball of the same ESR built on legion. |
| R13 | Hop vs descriptor order (50-04) | Approve the descriptor with the 24 h wait bypassed, run the hop against the live bytes, withdraw with `no-update` if it fails. Requires `withdraw.yml` (50-03 T1) and the immutable-release probe first. |
| R14 | Out-of-scope signing | Move SEC-04, SEC-12, SEC-13 and DIST-11's notarization clause to the Out of Scope table; mark D-U-N-S/Apple/Azure External Gates, Owner Decision 10 and the RENEWALS Apple/Azure rows superseded. Keep `sign-windows` code but make it report **skipped** when `AZURE_CLIENT_ID` is unset. Waive WINDOWS.md entry 22. |
| R15 | Ledger NG-075..081 | Owner amends via `scripts/ledger-amend.py`: drop NG-075 (MSIX, out of scope), mark NG-076..080 superseded by v1.6 IDs, keep NG-081 deferred. Claude prepares the exact command; owner runs it. |
| R16 | Where the close runs | Deploy worktree; `verify-platform.sh --gate` after the owner pass with a ledger-backed WINDOWS.md exclusion per deferred live row; tag `v1.6` locally, push only with owner approval, to Deocracy. |
| R17 | Defaults | **All critic defaults accepted** (§2). The owner may still override any one during the pass. |

Already settled before 2026-11-03 (do not re-ask): Windows signing never blocks Linux; the update
manifest (`release-manifest.json`) is a Release asset; no official store publishing; WR-03
descriptor exemption stays; DSH out of scope; `workspace/pba` stays separate.

## 2. Accepted defaults (R17)

- **Cloudflare names:** `events.powerbrowser.org`; `crash.powerbrowser.org` with
  `crash_report = "https://crash.powerbrowser.org/submit"`; R2 bucket `powerbrowser-mar` behind
  `downloads.powerbrowser.org`, r2.dev off; `status.powerbrowser.org` via
  `Deocracy/powerbrowser-status`; scheduler on workers.dev.
- **Scheduler mail:** deploy the 43 scheduler now with mail wired but unproven; prove the mail leg
  in the 47-04 checkpoint.
- **Mail and disclosure:** one owner mailbox for security@, contact@, privacy@; security.txt
  Expiry ~11 months out with a RENEWALS row; SECURITY.md keeps 5 business days; publish the org
  `.github` repo only after 47-04 test mails arrive.
- **Website:** publish with the postal address (owner supplies) and the MAR line "about 130 MB
  (estimated; exact size measured on the first release)", updated after 45-04. Repo
  `Deocracy/powerbrowser-website`, Cloudflare Pages Git integration authorised for only
  `powerbrowser-website` and `powerbrowser-updates`.
- **Bot App variables:** set both `BOT_APP_ID` and `BOT_APP_CLIENT_ID` (repository variables);
  `BOT_APP_PRIVATE_KEY` (PKCS#8) in environments `bot`, `release` and `descriptor`. Claude fixes
  `docs/RELEASING.md:283` and `:1065`.
- **Homebrew tap name:** keep `Deocracy/homebrew-tap`; Claude changes
  `channel-manifests.yml:286,297` and the Phase 56 docs (cask itself is deferred, R6).
- **Repo-controls:** close it in one apply session: Apps first, then
  `apply-repo-controls.mjs --yes`, the printed label create/delete lines, and the CodeQL PATCH;
  close 41 and 42 live together.
- **Release train facts source:** approve the read-only facts source (gh GETs in derive) and the
  exactly-one tracking-issue writer (gap plan 43-06).
- **Safe Browsing keyfile:** one directory `/var/lib/powerbrowser-release`, group `pb-runner`,
  chris a member, dir 0750, file `sb-gapi.data` 0440; `PB_KEYDIR=/var/lib/powerbrowser-release`;
  created by a NixOS tmpfiles rule in the 49-02 `nrs` change. (Not `sb-gapi.key`.)
- **First container build (45-04):** owner runs it locally on legion in the main checkout after
  any other session's build has ended; it fills `toolchain-baseline.txt` and measures the MAR.
- **MAR keys:** make the two offline primary `.p12` copies now if not certain they exist; run the
  secondary ceremony (44-01) with `PB=/home/chris/gsd-workspaces/deploy/Power-Browser` (only that
  objdir has certutil/pk12util/signmar). Accept closing SEC-05/SEC-09 with the release.yml
  key-selection change recorded as a follow-up.
- **Immutable-release probe (REL-02):** bot App creates a draft Release on a non-release-pattern
  tag `probe-1` if the release-tags ruleset allows it, never deleted; otherwise notes-only marking
  in `withdraw.yml`.
- **SEC-07 / DIST-07:** accept source-built signmar on the hosted runner and the as-built asset
  names (e.g. `powerbrowser-153.5.1-1.linux-x86_64.tar.xz`, stable
  `powerbrowser-linux-x86_64.tar.xz`); Claude amends SEC-07 and fills the linux-x86_64 asset row.
- **Phase 52:** accept the F1 scope reduction (F1 owner-resolved, F2/F3 automated) and amend
  FIX-01, TRAIN-06, ROADMAP criterion 1. Anthropic Console: two small monthly caps (owner supplies
  amounts), federation for the fixer, API key fallback only if the rule cannot be created; confirm
  the `@anthropic-ai/claude-code@2.1.314` pin.
- **Phase 51 rulings:** amend AUTO-02 (Theia PR does not move flake.lock); TRAIN-04 stale approval
  stays fail-closed; add an automated-security-fixes read-back control; ESR calendar pointer stays
  in RENEWALS; Renovate PRs merge with `--merge`; TRAIN-04 live supersede closes on fixtures, live
  half deferred.
- **Phase 48 rulings:** IN-03 admitted-key filter on the usage path; IN-04 Gecko telemetry pref
  stays blank; CR-03 rebrand-checklist line; events and crash rate limit 60 req/min/IP; one
  synthetic event; MON-01 keeps 26 h and runs the real stop; keep both `DOWNLOAD_COUNT_SECRET`
  RENEWALS rows and fill the holder.
- **Phase 46:** change the "Open download page" URL to `https://powerbrowser.org/download` after
  47-04 is live, then re-run `update-copy`.
- **Phase 53:** Upptime `Deocracy/powerbrowser-status`; Codeberg `Deocracy/powerbrowser`; tighten
  the action admission to `anthropics/claude-code-action@db77d4d3c98f3f6380e7cd45ffba2342a3dbde3c`.
- **Requirements boxes:** tick only in the end pass, on evidence; list each open live half as a
  dated deferral in the audit.

## 3. Values to collect from the owner during the pass

Ask each in a box at the step that needs it; none blocks the earlier stages.

- Exact legal name for the Deocracy copyright/trademark strings (R7), e.g. "Deocracy" or a
  registered entity name.
- Postal address for `/privacy` (`website-staging/privacy.html:87`).
- Destination mailbox for Email Routing, and a sending account different from it.
- Two Anthropic Console monthly spend caps (fixer, triage).
- Which second owner account (HarmonySprings or stasadance) runs the notification and triage
  drills (GitHub does not notify an account of its own actions).
- Windows 11 ISO/evaluation media and licence for `pkg-win11`; confirmation it may use legion's disk.
- Installer artwork files (R3).
- Whether the two primary MAR key offline copies already exist (dates) or must be made now.
- Payment method on the Cloudflare account (R2); Workers Paid only if the JWT-mint p95 exceeds 10 ms.
- Remaining Windows rulings not covered above: leftover `node.exe` reap on Windows (build a
  process-identity check vs accept one orphan until reboot) and whether the taskcluster-index
  `vs.tar.zst` toolchain artifact is acceptable for a release build. Recommend: accept the orphan
  with a recorded follow-up; accept the hash-pinned toolchain.

## 4. Stages, in order

Each stage lists its GSD entry point. Phase plan IDs refer to
`.planning/workstreams/deploy/phases/`.

### Stage A — Pre-flight (read-only)

```sh
cd /home/chris/coding/Power-Browser
git status --porcelain | wc -l; git log --oneline -5
node ~/.claude/gsd-core/bin/gsd-tools.cjs query workstream.get
# /gsd-workstreams switch deploy, then re-check workstream.get
node ~/.claude/gsd-core/bin/gsd-tools.cjs query init.manager --ws=deploy
node scripts/generate.mjs && scripts/verify-platform.sh --quick
```

Also check: whether ESR 153.6 or 153.7 has already shipped upstream (changes the first-release
timing, R12); `gh auth status` scopes (pushing `.github/workflows/*` needs `workflow`; org reads
and the runner-group PATCH need `admin:org` temporarily; labels need `repo`, `read:org`).

### Stage B — Deocracy move (R7, R8)

Claude, doc/code commits:
1. `configuration.toml` legal strings → Deocracy (value from §3), WEB-01 footer, README.md:98;
   regenerate (`node scripts/generate.mjs`); brand scan; `--quick`.
2. Replace live `DeBIOS-Foundation` slugs in plan commands, BLOCKED.md files, docs and scripts
   (keep historical run URLs as records). Grep: `git grep -n 'DeBIOS-Foundation'`.
3. Fix 41-04-PLAN's stale org shape (three owners, plan "team", not two owners/Free).

Owner (prepare exact commands, owner runs):
4. `git fetch deocracy && git merge deocracy/main` (no content change), `git push deocracy main`.
5. `git remote rename origin debios && git remote rename deocracy origin`.
6. After stage E's ruleset apply succeeds: archive `DeBIOS-Foundation/powerbrowser` with a README
   pointer (`gh repo archive DeBIOS-Foundation/powerbrowser` after a pointer commit).

### Stage C — Planning reconciliation (doc-only commits)

- REQUIREMENTS.md: R14 out-of-scope moves; R4 and R6 deferrals to a v1.7 section with dates;
  amend FIX-01, TRAIN-06, AUTO-02, SEC-07, criterion texts per §2; PKG-20 domain text left for v1.7.
- ROADMAP.md: 54 goal and criterion 5 (unsigned, no Azure); 55 marked deferred with the ad-hoc
  goal; 56 scoped to Nix; 58 marked dated deferral; 47 and 56 External gates for Apple removed;
  progress table brought to the real plan counts.
- STATE.md and state.json: real counts (78/84 SUMMARYs), current phase, drop the D-U-N-S todo,
  last activity.
- WINDOWS.md: waive 22; move 23 with 55; fix entry 24's milestone label (v1.6).
- `52-04-SUMMARY.md` status: resolved by 25ef9364. `57` docs: patch number is `055`, flip is the
  `CRASH_REPORTER_ENABLED` constant (WR-09). Phase 53 BLOCKED item 4 is stale (`/events` target
  exists).
- Fix invalid plan commands: `55-04-PLAN.md:204` (no macos input; moot after R4),
  `51-01-PLAN.md:310` (`reason` accepts only tick|owner|self|fix).
- HANDOFF.md: point at this file.

### Stage D — Gap plans (R9), before the owner pass

Insert with `/gsd-phase --insert` or `/gsd-plan-phase N --gaps --ws deploy`, then
`/gsd-execute-phase N --ws deploy`. One fix per plan, Opus for code.

| Gap | Phase | What |
|---|---|---|
| G-46 | 46 | WebDriver hop driver (VERIFICATION G2, UPD-24); also plan the N/N+1 rebuild: bump `powerbrowser/packaging/version-nplus1/` above 153.5.1, refresh `.mozbuild/mar-hop/nplus1.mar`. |
| G-49a | 49 | Linux complete-MAR emit in `package-linux.sh` (`release.yml:193` uploads `*.complete.mar` with `if-no-files-found: error`). |
| G-49b | 49 | Invoke the packaged rows and register `install-matrix` in `build-linux`. |
| G-49c | 49 | Post-publish artifact deletion (INF-04). |
| G-43 | 43 | 43-06: live facts collector and exactly-one tracking-issue writer behind the negated dry-run gate; then GH-15 (50-04 T1). Shared with 50/51/52/58. |
| G-50 | 50 | 50-03 T1 `withdraw.yml` and the probe (R13 prerequisite). |
| G-51 | 51 | 51-05 `renovate-theia` job (premise met by 48-03). |
| G-52 | 52 | `OWNER_LOGIN` switch (R11); F1 amendment text. |
| G-54a | 54 | `windows-latest` sidecar job + `PB_WIN_SIDECAR_SUMS_SHA256` variable (BLOCKED item 8). |
| G-54b | 54 | Unsigned Windows publish path: Windows files to the MAR origin after the Linux publish (A2, plan 54-11; the Release stays Linux-only), descriptor and channel-live; never a dependency of `sign-publish`/`descriptor`/`channel-live` for Linux (`win-sign-chain` row must stay green). |
| G-54c | 54 | Registry move patch `Software\Mozilla`→`Software\PowerBrowser` (installer + app readers), survey removal, installer title (R3). Regenerate the patch from a patched tree. |
| G-54d | 54 | libvirt access Nix block for `pb-runner` (exact block does not exist in any file yet). |
| G-57 | 57 | B6 auto-submit env and pref lock; 57-01 Task 2 layer-3 assertion. |
| G-sign | 49/54 | `sign-windows` reports skipped when `AZURE_CLIENT_ID` is unset (R14). |
| G-ctl | 41/42 | Scope repo-controls to installations touching the three repos (R10); add `state/*` labels the train writes (`release-train.mjs:122`) to `.github/settings/labels.json`; tap name fix (§2). |
| G-cmd | 43/53 | Write the commands no file contains yet: scheduler repo `wrangler.toml` (cron `17 * * * *`, `send_email` binding `MAIL`); Codeberg bare-repo setup at `/var/lib/codeberg-mirror/powerbrowser.git` with credential helper. |

Each gap ends with `--quick` green and a self-test where it adds a check (CLAUDE.md
verification rules).

### Stage E — Owner live pass (global order)

Resume each unsummarised checkpoint plan with `/gsd-execute-phase N --ws deploy` (41-04, 44-01,
47-04, 50-04, 52-05, 57-04). Open owner tasks inside summarised plans are recorded as UAT rows at
the verify pass. Exact steps per item: FINISH-SURVEY.md §A and each phase's BLOCKED.md.

1. **GitHub (41-04 T2, 42-04 T2, 51):** create `powerbrowser-bot` and `powerbrowser-clock` Apps;
   restrict `claude`/`slack` (R10); `node scripts/apply-repo-controls.mjs --yes`; label lines;
   CodeQL PATCH; variables `BOT_APP_ID`, `BOT_APP_CLIENT_ID`, `OWNER_LOGIN`, environments and
   secrets per the table in FINISH-SURVEY.md §B git-push. Then `node scripts/verify-repo-controls.mjs`
   green. Then stage B step 6 (archive).
2. **Cloudflare + DNS (47-04):** account with payment method; move `powerbrowser.org` nameservers
   (DNSSEC off, full record inventory first); Email Routing (mailbox from §3); Pages for
   `powerbrowser-website` and `powerbrowser-updates`; publish the site.
3. **Workers and storage:** scheduler (43-05 T2), events Worker (48-05 T2), crash receiver (57,
   replace `REPLACE-WITH-CRASH-HOSTNAME`), R2 `powerbrowser-mar` + `downloads.` host (49-05 T3:
   `R2_MAR_BUCKET`, `CLOUDFLARE_ACCOUNT_ID`, `R2_MAR_WRITE_TOKEN` in `release`), Upptime status (53).
4. **Keys (44-01):** primary offline copies; secondary MAR key ceremony; `MAR_SIGNING_P12_B64`,
   `MAR_SIGNING_P12_PASSWORD` in `release`; fill the six lines 44-04-SUMMARY.md names.
5. **legion (49-02 T3):** `/etc/nixos` change for the runner, key dir tmpfiles rule and libvirt
   block, committed and pushed with `pkexec bash -c '...; nrs "msg"'`; register the runner.
6. **Local release build (45-04):** container build in the main checkout after any other build
   ends; record toolchain baseline and MAR size; update the website MAR line.
7. **Anthropic (52-05, 53-04 T2):** Console workspaces with caps; federation rule
   (`ANTHROPIC_FEDERATION_RULE_ID`, `ANTHROPIC_ORGANIZATION_ID`) or `ANTHROPIC_API_KEY` in `fixer`;
   `ANTHROPIC_API_KEY` in `triage`.
8. **Drills (41-04 step 11, 53-04 steps 5–6, 48-05):** with the second owner account from §3.
9. **First Linux release (50-03 T3, 50-04):** when the 153.7 (or 153.8) bump PR merges; probe,
   then approve `release`, approve `descriptor` with bypass, hop against live, withdraw on failure
   (R13); owner's own N-1→N hop.
10. **Nix channel (56-05 T2, Nix half only):** flake + binary cache keys.
11. **Windows (54-04 T3):** `pkg-win11` VM with guest agent and stock Firefox, baseline snapshot;
    five-cell matrix; dispatch `build-windows`; unsigned publish; descriptor approval after the
    owner's N-1→N hop.
12. **TEL-13 (57-01 T2, 57-04):** tier-3 reporter-enabled build and the
    `CRASH_REPORTER_ENABLED` flip after the Windows release.
13. **Ledger (R15):** owner runs the prepared `scripts/ledger-amend.py` command.

After each owner reply, run that plan's post-checkpoint record task (41-04 T3, 42-04 T3,
48-05 T3, 53-04 T3, …).

### Stage F — Builds and gate (after the last code commit)

```sh
nix develop .#firefox     # dev ./mach build (~47–54 min) → objdir/dist/bin/powerbrowser
                          # release objdir rebuild (~54 min; objdir-release is 153.5.0, stale)
                          # N+1 MAR per docs/BUILD.md
scripts/verify-platform.sh --build
scripts/verify-platform.sh --gate
```

Before `--gate`, replace the three dead `GATE_KNOWN_OPEN_EXCLUSIONS` rows (keyed to fixed entries
5 and 10) with one WINDOWS.md-backed exclusion per deferred live row: `macos-install-matrix`
(R4), channel rows for Flathub/winget/cask (R6), 58 rows (R5), plus any live row the owner pass
could not complete. Each exclusion names its ledger entry and due date. This is the last code
commit.

### Stage G — Verify, audit, complete

```
/gsd-execute-phase N --ws deploy     # every phase whose VERIFICATION is missing or stale (40 is stale)
/gsd-verify-work N --ws deploy       # each phase that returns human_needed; deferred live items = skipped with reason
/gsd-audit-uat                       # with the workstream switched
/gsd-audit-milestone v1.6 --ws deploy   # write to .planning/workstreams/deploy/v1.6-MILESTONE-AUDIT.md
/gsd-complete-milestone v1.6 --ws deploy
```

- Always pass the phase number to verify-work.
- Tick REQUIREMENTS.md boxes here, on evidence (§2).
- At complete-milestone: `audit-open` → acknowledge; readiness → `override_closeout` with the
  deferral list from §5; archive call must be
  `gsd_run query milestone.complete v1.6 --name "Deployment setup" --confirm --ws=deploy`.
- Hand-fix Phase 45 SUMMARY one-liners before they reach MILESTONES.md (P7).

### Stage H — Tag and push (owner approval)

`git tag -a v1.6` (v1.5 is not tagged yet; out-of-order tags are allowed, note it). Push the tag
and branch to the Deocracy remote only after an AskUserQuestion approval. Optional:
`/gsd-workstreams complete deploy` after inspecting it. Do not run `/gsd-cleanup`.

## 5. Deferral list for the override close

| Item | Moves to | Due | Reason |
|---|---|---|---|
| Phase 55 macOS (ad-hoc DMG), WINDOWS.md 22–23 | v1.7 | — | No macOS build has run; needs Mac hardware (R4) |
| Flathub PKG-20, winget DIST-04, cask DIST-11/12 | v1.7 | — | Nix only in v1.6 (R6) |
| Phase 58 T2–T4 (175 rebase, measure, ship) | dated deferral | 2027-05-27 → 2027-09-07 | No 175 tree before the nightly (R5) |
| FIX-10 (real red PR) | dated deferral | by 2027-05-27 | Calendar-bound |
| Phase 43 exit test, if 153.7/153.8 have not landed by close | dated deferral | 2026-11-24 | Calendar-bound |
| TRAIN-04 live supersede, other live halves the pass could not complete | dated deferral | owner date | Recorded per item in the audit |
| SEC-05/09 pipeline rotation (release.yml key selection) | follow-up | — | §2 |
| Windows leftover `node.exe` reap | follow-up | — | §3, if accepted |

## 6. Pitfalls (full text in FINISH-SURVEY.md §B gsd-close §7)

P1 missing `--ws` writes v1.5 files · P2 audit file must sit in the workstream directory ·
P3 skip `/gsd-cleanup` · P4 verify last · P5 model tiers override per agent · P6 `origin` pointed
at DeBIOS until stage B · P7 Phase 45 one-liners · P8 tag order. Also: `--gate` cannot be combined
with `--quick`/`--only`; an unstaged new file is invisible to the brand scan; never assert on the
absence of a log line you emit yourself.
