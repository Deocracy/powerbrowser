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
