---
phase: 41-repository-controls-and-github-apps-a
plan: 04
subsystem: repository-governance
tags: [gh-02, sec-06, sec-11, gh-05, gh-06, gh-07, gh-08, gh-09, gh-10, gh-11, gh-18, owner-live-work, live-state-at-parking]
requires:
  - phase: 41-01..41-03
    provides: the repo-controls apply and verify scripts, the .github/settings bodies, notify-drill.yml
provides:
  - Record of the owner's live OWNER-PASS section 1 work done by 2026-11-07, for the v1.6 audit
affects: [Phase 59 plan 59-02 (CF-15 device-flow token input), Phase 59 plan 59-04 (OWNER-PASS section 1 remainder, CF-02), Phase 59 plan 59-07 (v1.6 audit)]
status: partial
actuals:
  tokens: 0
  tasks: 0
  commits: 0
plan_head_before: 576b430bb8c1d16fddf42c87b669e044019971d6
plan_head_after: 576b430bb8c1d16fddf42c87b669e044019971d6
key-files:
  created: []
  modified: []
key-decisions:
  - "Recorded by Phase 59 plan 59-01 from CARRY-FORWARD-v1.7.md. No task of this plan was executed by an agent, so actuals are zero and both plan heads are the Phase 59 lane base commit."
requirements-completed: []
---

# Phase 41 Plan 04: live repository controls Summary (owner live work, partial)

No task of this plan was executed by an agent. Chris did much of the Task 2 live work on
2026-11-06/07 through OWNER-PASS section 1. This file records that state so the v1.6 audit reads
it. Tasks 1, 3 and 4 are not executed, the twelve-field reply has not been given, and no
requirement is marked complete.

## Live state at parking (2026-11-07, recorded by Phase 59 plan 59-01)

Source: `.planning/CARRY-FORWARD-v1.7.md` section 2, "Live state at parking" (the GitHub bullet and
the parked list), and its section 5 for CodeQL. Plan 59-01 copied the record and redid nothing.
The organisation is Deocracy (`Deocracy/powerbrowser`).

Done live:

- Apps powerbrowser-bot (5633681) and powerbrowser-clock (5633729) installed (Task 2 step 4).
- The `claude` and `slack` Apps limited to the other 30 repos (OWNER-PASS section 1 step 4, R10).
- `apply-repo-controls --yes`, 25 writes (Task 2 step 6).
- Labels (OWNER-PASS section 1 step 6; also recorded in 42-04).
- Tag probe refused (Task 2 step 7).
- Runner group restricted to `release.yml@main` (Task 2 step 8).
- Variables `BOT_APP_ID`, `BOT_APP_CLIENT_ID` and `OWNER_LOGIN` (OWNER-PASS section 1 step 10).
- The bot key in environments bot, release and descriptor, and in `powerbrowser-updates`
  (OWNER-PASS section 1 step 10).
- Cloudflare Pages App declared (`.github/settings/app-cloudflare-workers-and-pages.json`).
- CodeQL default setup applied (OWNER-PASS section 1 step 7).

Parked, open:

- App-list reads in `repo-controls`: 5 red lines, one per installation: `slack`, `claude`,
  `powerbrowser-bot`, `powerbrowser-clock` and `cloudflare-workers-and-pages`. Field 10 was answered
  DEVICE-FLOW. The token input is CF-15 (Phase 59 plan 59-02).
- Notifications and the drills from HarmonySprings (CF-02; Task 2 steps 10 and 11, OWNER-PASS
  section 1 steps 12 and 13).
- Archive of the old repository (FINISH-PLAN Stage B step 6): not done.
- The twelve reply fields of Task 2: not yet given.

## Not executed

All four tasks are still owed:

- **Task 1** (pre-checkpoint proof: `--quick`, the dry-run write list, the pre-apply live baseline,
  the drill-commit check): not run.
- **Task 2** (owner checkpoint): done live in part (above). The twelve-field reply is owed. The bot
  key exists, so field 4's "no private key generated" cannot be confirmed for powerbrowser-bot;
  OWNER-PASS section 1 step 10 is the step that generates that key.
- **Task 3** (turn the reply into tracked state, run `repo-controls` live, the DEVICE-FLOW edit to
  `scripts/verify-repo-controls.mjs`, the five RELEASING.md subsections, the Applied dates): not
  executed. The DEVICE-FLOW edit is CF-15.
- **Task 4** (the owner's DEVICE-FLOW run ending in `repo-controls: PASS`): not executed.

This record claims none of ROADMAP Phase 41 criteria 1, 2, 4 and 5. Each needs the reply and a
green live `repo-controls` row.

## Self-Check: PASSED

- This file exists and is committed with the rest of plan 59-01 Task 3.
- It holds no token, key, password, database id, account id or recovery-code location. The only
  ids are the two App numbers written verbatim in CARRY-FORWARD section 2 and the lane base commit.
- `node scripts/scan-brand-residue.mjs` is green with this file staged. The scan does not read
  `.planning/`, so this file was also checked directly for the originating-product residue
  probe: zero hits.
