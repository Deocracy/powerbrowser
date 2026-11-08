# Carry-forward note for the v1.7 session

Written 2026-11-07 by the v1.5 close-out session at Chris's request. It is a note, not a plan:
the v1.7 session reads it when it writes the v1.7 roadmap. Chris's rulings that produced it, all
given 2026-11-07 through the question box:

- v1.5 is shipped and tagged (`v1.5` at a4ea096c, pushed). Its human checklist, live halves and
  deployments are deferred so the product can be used now.
- v1.6 Deployment setup **stays open** on workstream `deploy`. It is not closed, tagged or pushed
  by this note. Its owner live pass is deferred the same way.
- v1.7 opens with **one carry-forward phase** that holds every deferred live item below, listed
  by source. Backlog rows and WINDOWS.md entries keep their ids and point to that phase once it
  has a number. Nothing in v1.7 was touched by this session; `~/orca/workspaces/Power-Browser/
  v1.7-Orca-integration` and its DECISIONS.md D-01..D-19 are the v1.7 session's own.

## 1. From v1.5 (root planning, archived under `.planning/milestones/`)

| Item | Where | Size |
|---|---|---|
| Human-only checklist | `milestones/v1.5-phases/39-v1-5-close-out/39-HUMAN-CHECKLIST.md` | 41 unticked items |
| Requirement re-ticks after the checklist | `milestones/v1.5-phases/39-v1-5-close-out/39-20-DECISIONS.md` | 12 rows; 46 rows unticked in `milestones/v1.5-REQUIREMENTS.md` |
| Live halves of phases 29, 30, 31 | `/gsd-verify-work 29`, `30`, `31` (UATs under `milestones/v1.5-phases/`) | 3 conversational UAT runs |
| PAGE-05 libpulse packaging | backlog 999.19; keep unticked until it lands | 1 packaging change |
| Deferred UAT follow-ups | backlog 999.17–999.26 (ROADMAP.md "BACKLOG" sections) | 10 rows |
| Close-out full-run residue | backlog 999.27–999.33; WINDOWS.md 25–43 (open) | 7 rows, 19 ledger entries |
| PROMPT-03 page dialogs | backlog 999.3; WINDOWS.md 26 | 1 row |
| Gate state at close | `--gate` PASS-WITH-EXCLUSIONS at 77e5d037, 32 reds all keyed to open ledger ids | re-run after fixes |

Rule carried with it: a ledger entry closing turns its excluded row red again
(`GATE_KNOWN_OPEN_EXCLUSIONS` binds to open WINDOWS.md ids). Close entries only with the fix.

## 2. From v1.6 Deployment setup (workstream `deploy`, still open)

Owner rulings R1–R16 in `workstreams/deploy/FINISH-PLAN.md` §1 stand; do not re-ask them. Every
unexecuted plan below is an owner live step, not Claude code, except 57-08.

| Phase | Unexecuted plan | What it is |
|---|---|---|
| 41 Repository controls and GitHub Apps | 41-04 | Apps, controls, variables, secrets live (OWNER-PASS §1); drill (§8) |
| 44 Trust path | 44-01 | Secondary MAR key ceremony, public DER handed over (OWNER-PASS §4) |
| 47 Hosting, website and mail | 47-04 | Cloudflare/DNS, Workers, Email Routing (OWNER-PASS §2–3); done live 2026-11-06/07 except the items in "Live state" below; needs recording |
| 50 Release train and first Linux release | 50-04 | First public Linux release after the train's bump PR (R12, R13; OWNER-PASS §9) |
| 52 Claude fixer | 52-05 | Anthropic Console caps and fixer live (OWNER-PASS §7) |
| 57 Native crash reporting | 57-04 | TEL-13 crash-reporter flip, owner run (OWNER-PASS §12) |
| 57 Native crash reporting | 57-08 | Claude item: boundary `clearEnv` for `MOZ_CRASHREPORTER_AUTO_SUBMIT`; was blocked on PowerBrowserAPI.sys.mjs held by the v1.5 session, which is now committed (a4ea096c), so it is unblocked |

Also deferred inside v1.6 and already recorded there: the legion runner (OWNER-PASS §5), local
release build (§6), Nix channel (§10), Windows VM and unsigned release (§11, needs the Windows 11
ISO and licence), ledger amendment NG-075..081 (§13, R15), and the open owner values in
OWNER-PASS "Open values and decisions" (mailbox, spend caps, Cloudflare payment, disk for
`pkg-win11`). Already deferred to v1.7 by ruling: macOS phase 55 (R4, WINDOWS.md 22–23, 32),
Flathub, winget and the Homebrew cask (R6), installer artwork (A7), ESR 175 phase 58 tasks
58-03 T2–T4 dated 2027-05-27 to 2027-09-07 (R5).

### Live state at parking (2026-11-07, Chris: combine v1.5 and v1.6 work into v1.7)

None of this is recorded in the deploy workstream yet. Record it in the 41-04, 42-04, 43-05,
47-04 and 48-05 SUMMARYs; do not redo it.

Done live:

- §1 GitHub: Apps `powerbrowser-bot` (5633681) and `powerbrowser-clock` (5633729) installed;
  claude/slack limited to the other 30 repos; `apply-repo-controls --yes` (25 writes); labels;
  tag probe refused; runner group restricted to `release.yml@main`; `BOT_APP_ID`,
  `BOT_APP_CLIENT_ID`, `OWNER_LOGIN`; bot key in environments bot, release, descriptor and in
  `powerbrowser-updates`. Cloudflare Pages App declared (`app-cloudflare-workers-and-pages.json`).
- §2 Cloudflare: zone on Cloudflare; Pages `powerbrowser-website` (powerbrowser.org, www) and
  `powerbrowser-updates` (updates.powerbrowser.org), both Git-linked; four pages byte-equal, 404
  page live; update rule is six placeholders plus a splat (ten never match on Pages, 51da41bc);
  security.txt to 2027-10-06; Email Routing security@/contact@/privacy@ → christopher@deocracy.org,
  three test mails arrived. Policy files repo-level only (no org defaults in `Deocracy/.github`).
- §3 so far: R2 buckets `powerbrowser-mar` (public on downloads.powerbrowser.org) and
  `powerbrowser-crash-reports` (private, 30-day lifecycle); one zone rate-limit rule, 10 per 10 s per
  IP (the Free-plan form of the 60/min ruling); events Worker on events.powerbrowser.org with D1
  `powerbrowser-events` (probes 200 synthetic, 413, 429); `DOWNLOAD_COUNT_SECRET` in the Worker and
  the bot environment; crash Worker on crash.powerbrowser.org (probes 200 CrashID, 413, 429);
  maintenance issue #7 pinned; `R2_MAR_BUCKET` and `CLOUDFLARE_ACCOUNT_ID` in the release
  environment; repos `Deocracy/powerbrowser-status` (Upptime config, `status` CNAME) and
  `Deocracy/powerbrowser-scheduler` (scaffold, bundles; not deployed).

Parked, waiting on Chris:

- Clock App private key → then deploy the scheduler (`CLOCK_PRIVATE_KEY` as PKCS#8) and run the
  dry-run train dispatch. Until it runs, the watchdog in `powerbrowser-updates` stays
  **disabled** (`gh workflow enable watchdog.yml -R Deocracy/powerbrowser-updates` after the clock
  ticks).
- `R2_MAR_WRITE_TOKEN` (bucket-scoped R2 Object Read & Write) in the release environment.
- `GH_PAT` (classic, repo + workflow) in `Deocracy/powerbrowser-status`; then dispatch its Upptime
  workflows and enable Pages for status.powerbrowser.org.
- Codeberg org/repo/token (token to `/etc/codeberg-mirror/mirror-push`).
- Cloudflare API token `powerbrowser-claude` at `~/.config/cloudflare/pb-token` expires
  2026-12-06 and was pasted in a chat: rotate it after the owner pass (RENEWALS row).
- `configuration.toml [urls].crash_report` and its allowlist row (Claude, after 57-08).
- App-list reads in `repo-controls` (5 red lines, one per installation): device-flow token input, Chris chose DEVICE-FLOW.

## 3. Shape of the carry-forward phase

One phase, first in the v1.7 roadmap, with one plan per source row above that needs a human
(checklist, verify-work 29–31, owner pass sections) and one gap-closure plan per red that needs
code (999.28–999.31, 57-08). Its exit criterion is the `--gate` run going green with no
exclusions, or every remaining exclusion re-dated in WINDOWS.md. Closing v1.6 (`--ws deploy`,
override closeout per R1/R16, tag `v1.6`, push only on Chris's word) can happen inside that phase
once the owner pass is done, or before it if Chris rules so.

## 4. Deferred to v1.7 on 2026-11-07 (Chris: combine the v1.5 and v1.6 remainder in v1.7)

Each item moves to the v1.7 carry-forward phase with its id. "Owner" items need Chris; "Claude"
items need no input.

| Id | Owner | Item | Source |
|---|---|---|---|
| CF-01 | Owner | §3 remainder: R2 MAR write token (`R2_MAR_WRITE_TOKEN`, release env), clock App key (then Claude deploys the scheduler and re-enables the watchdog), Upptime `GH_PAT`, Codeberg org/repo/token | OWNER-PASS §3; "Live state" above |
| CF-02 | Owner | §1 leftovers: GitHub notifications (email on failed workflows; Mobile push for reviews, assignments, mentions) and the drills from HarmonySprings | OWNER-PASS §1 steps 12-13 |
| CF-03 | Owner | §4 MAR key ceremony: two primary `.p12` copies, the secondary ceremony, release secrets | OWNER-PASS §4; plan 44-01 |
| CF-04 | Owner | §5 legion runner: one `/etc/nixos` change (runner, libvirt, Safe Browsing key dir, Codeberg timer) and the runner acceptance drill | OWNER-PASS §5; 49-02 T3 |
| CF-05 | Owner | §6 local release build | OWNER-PASS §6; 45-04 |
| CF-06 | Owner | §7 Anthropic: fixer and triage workspaces with spend caps, fixer federation rule, triage `ANTHROPIC_API_KEY` | OWNER-PASS §7; 52-05, 53-04 |
| CF-07 | Owner | §8 drills | OWNER-PASS §8; 41-04 step 13, 53-04, 48-05 |
| CF-08 | Owner | §9 first Linux release: release probe, merge the bump PR, approve `release` and `descriptor`, hop drill, `/download` check | OWNER-PASS §9; 50-03 T3, 50-04 |
| CF-09 | Owner | §10 Nix channel: hash record, Cachix licence request and cache | OWNER-PASS §10; 56-05 T2 |
| CF-10 | Owner | §11 Windows: Windows 11 VM (ISO, licence, disk), `build-windows` | OWNER-PASS §11; 54-04 T3 |
| CF-11 | Owner | §12 TEL-13 crash reporter switch-on, after plan 57-08 (CF-15) | OWNER-PASS §12; 57-04 |
| CF-12 | Owner | §13 ledger: the six NG-075..080 amendments, run by Chris with his own approval words (OWNER-PASS §13 has the exact lines) | OWNER-PASS §13; R15 |
| CF-13 | Owner | Rotate the Cloudflare token `powerbrowser-claude` after the owner pass (pasted in a chat; expires 2026-12-06) | docs/RENEWALS.md |
| CF-14 | Claude | Record the live work in the 41-04, 42-04, 43-05, 47-04 and 48-05 SUMMARYs (from "Live state" above) | deploy workstream |
| CF-15 | Claude | App-list device-flow token input for `repo-controls`; plan 57-08 (`clearEnv` for `MOZ_CRASHREPORTER_AUTO_SUBMIT`); the `/etc/nixos` block for the Codeberg mirror | 41-04 field 10 (DEVICE-FLOW); 57 BLOCKED; 53 BLOCKED item 2 |
| CF-16 | Claude | Stage F: rebuild dev and release objdirs, build the N+1 MAR and run the hop, then `--build` and `--gate` | FINISH-PLAN Stage F |
| CF-17 | Owner | v1.5: 41-item human checklist, live halves of `/gsd-verify-work 29/30/31`, 46 unticked requirement rows | §1 above |
| CF-18 | Owner | Unexecuted v1.6 owner plans 41-04, 44-01, 47-04, 50-04, 52-05, 57-04, 57-08 (41-04 and 47-04 mostly done live; record, then finish) | §2 above |
| CF-19 | Owner | Pushes: `main` was pushed 2026-11-06 with Chris's OK; local commits since then (468d03a0, effb44b4 and this note) and the `v1.5` tag wait on Chris's word | 2026-11-07 ruling |

## 5. Deferrals already recorded inside v1.6

These were deferred before 2026-11-07 and keep their own dates and ids. The v1.7 phase carries
them; it does not re-decide them.

**Owner rulings (FINISH-PLAN.md §1 and §5):**

| Item | Deferred to | Date | Ruling |
|---|---|---|---|
| Phase 55 macOS (ad-hoc DMG); WINDOWS.md 22-23 | v1.7 | — | R4 (needs Mac hardware) |
| Flathub PKG-20, winget DIST-04, Homebrew cask DIST-11/12 | v1.7 | — | R6 (Nix only in v1.6) |
| Installer wizard artwork | v1.7 | — | A7 (v1.6 uses the art in the tree) |
| Phase 58 T2-T4: ESR 175 rebase, dual-build measurement, ship | dated | 2027-05-27 to 2027-09-07 | R5 |
| FIX-10 live proof (a real red PR fixed by the fixer) | dated | by 2027-05-27 | FINISH-PLAN §5 |
| Phase 43 exit test (a bump PR with no hand dispatch), if 153.7/153.8 land after close | dated | 2026-11-24 | FINISH-PLAN §5 |
| TRAIN-04 live supersede and other live halves the pass cannot complete | dated | owner date | FINISH-PLAN §5, recorded per item in the audit |

**Ledger rows (`scripts/ledger-report.py`), all `deferred-approved`, owner chris:**

| Id | Phase | What | Planned end state |
|---|---|---|---|
| NG-075 | 999.2 | Windows MSIX package | out of scope (R15, CF-12) |
| NG-076 | 999.2 | macOS DMG with .icns | superseded by v1.6 PKG-14, deferred to v1.7 (CF-12) |
| NG-077 | 999.2 | Windows and macOS install matrix and per-OS MAR hop | superseded by MTX-01, UPD-16, UPD-24; macOS part by PKG-16 (CF-12) |
| NG-078 | 999.2 | A release pipeline per RELEASING.md and SEED-001 | superseded by DIST-02, DIST-07, REL-03 (CF-12) |
| NG-079 | 999.2 | updates.powerbrowser.org serves updates | superseded by DIST-03, DIST-08, UPD-17; host now live (CF-12) |
| NG-080 | 999.2 | A production crash-ingest host receives reports | superseded by TEL-07, TEL-09, TEL-13; receiver now live (CF-12) |
| NG-081 | 999.2 | Per-fixture Gecko builds (BLD-02) and fixture live builds | stays deferred-approved |
| NG-089 | 26 | UAT sheets 10, 13, 14, 14.1, 14.1.1, 15 with no pending result | stays deferred (WINDOWS.md 35) |

**WINDOWS.md entries owned by v1.6 phases (still open):** 22 and 23 (phase 55, macOS, with R4);
24 (phase 44, `build-update-xml` full-tier row red by design until the N+1 MAR exists, CF-16);
31 (phase 39 run, lists the deploy live rows `repo-controls`, `channel-live`, `codeberg-mirror-live`,
`upptime-sweep-live`, which close with CF-01, CF-08 and CF-15).

**Per-phase BLOCKED.md files** under `workstreams/deploy/phases/` (each item there is an owner or
engineering deferral with its own reason):

| Phase | Open items | Already resolved live by 2026-11-07 |
|---|---|---|
| 43 Release train skeleton | 3 (workflow_run wake held out, first live bot PR prerequisites, tracking-issue writer) | bot App and its variables |
| 48 Telemetry, sweep, watchdog | 6 | §1 maintenance issue #7 pinned; §3 watchdog applied (disabled until the clock runs); §6 synthetic probe secret set and probed |
| 49 Release pipeline, legion runner | owner, engineering and 49-02/49-04/49-05 items | 49-05: `powerbrowser-mar` on downloads.powerbrowser.org, `R2_MAR_BUCKET`, `CLOUDFLARE_ACCOUNT_ID` (write token is CF-01) |
| 50 First public Linux release | 6 | §6 prerequisite: `BOT_APP_CLIENT_ID` and `BOT_APP_PRIVATE_KEY` in powerbrowser-updates |
| 51 Dependency flow, supersede | 18 | §11 CodeQL default setup applied by 41-04 |
| 52 Claude fixer | 6 (item 5 resolved earlier) | — |
| 53 Support operations | 7 (item 4 resolved earlier) | §3 status repo and CNAME created (`GH_PAT` is CF-01); §5 mail routing live |
| 54 Windows | 10 plus the 54-02 unmet must-haves | — |
| 55 macOS | 9, all under R4 | — |
| 56 Package channels | 17 (item 5 closed) | §10 homebrew-tap exists and the bot App is installed on it |
| 57 Native crash reporting | B2, B4, B5, B6 | B3: receiver deployed on crash.powerbrowser.org, probes 200/413/429 |
| 58 ESR 175 | 6 owner decisions and writers | — |
